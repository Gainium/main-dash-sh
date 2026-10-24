// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HelpArticleModal } from '@/components/modals/HelpArticleModal';

/**
 * Indicator pages link to each other as gainium.io/indicators/<slug>. Inside
 * the dashboard such a link opens that article in the modal, instead of
 * leaving for the website.
 */

const indicator = (slug: string, name: string, content: string) => ({
  metadata: {
    slug,
    name,
    kind: 'native',
    aliases: [],
    category: 'momentum',
    description: '',
    tldr: '',
    catalogKeys: [slug],
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
  content,
});

let requested: string[];

beforeEach(() => {
  requested = [];
  const routes: Record<string, unknown> = {
    '/indicators': {
      data: [indicator('rsi', 'RSI', '').metadata, indicator('macd', 'MACD', '').metadata],
      pagination: { total: 2, page: 1, limit: 100, totalPages: 1, hasNext: false, hasPrev: false },
    },
    '/indicators/rsi': indicator(
      'rsi',
      'Relative Strength Index (RSI)',
      'Compare with [MACD](https://gainium.io/indicators/macd) or [the blog](https://gainium.io/blog/x).'
    ),
    '/indicators/macd': indicator('macd', 'MACD', 'MACD body'),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const { pathname } = new URL(input, 'http://dashboard.local');
      requested.push(pathname);
      const body = routes[pathname];
      return body === undefined
        ? new Response('Not found', { status: 404 })
        : new Response(JSON.stringify(body), { status: 200 });
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HelpArticleModal links', () => {
  test('a gainium.io/indicators link opens that article in the modal', async () => {
    render(<HelpArticleModal slug="rsi" onClose={() => undefined} />);

    const link = await screen.findByRole('link', { name: 'MACD' });
    expect(link.getAttribute('href')).toBe('/help/macd');
    expect(link.getAttribute('target')).toBeNull();

    fireEvent.click(link);

    await waitFor(() =>
      expect(screen.getByText('MACD body')).toBeTruthy()
    );
    expect(requested).toContain('/indicators/macd');
  });

  test('other gainium.io links still open in a new tab', async () => {
    render(<HelpArticleModal slug="rsi" onClose={() => undefined} />);

    const link = await screen.findByRole('link', { name: 'the blog' });
    expect(link.getAttribute('href')).toBe('https://gainium.io/blog/x');
    expect(link.getAttribute('target')).toBe('_blank');
  });
});
