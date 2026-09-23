/**
 * Runner note: `.vitest.test.tsx`, not `.unit.test.ts`. core's own
 * `playwright.unit.config.ts` only collects `.unit.test.*`, so it never sees
 * this file; the parent's `vitest.config.ts` includes core's `.vitest.test.*`
 * and supplies `import.meta.env`, which every module importing the logger needs.
 * Run from the parent:
 *   NODE_ENV=development npx vitest run core/tests/bug855StatusToggleBuyType.vitest.test.tsx
 * (`NODE_ENV=development` is required on the VPS, where the shell exports
 * `production` and React's prod build has no `act`.)
 *
 * `buyType` is the manual-buy mode picked in the grid start dialog. The status
 * toggle used to default it to `all` on every call, so a plain Start/Stop of a
 * combo/DCA/hedge bot put a buy mode on the wire that those workers never
 * apply — its only effect was a "Manual buy" event row the user never caused.
 * The default deliberately STAYS on the grid path, where the worker really
 * does consume `buyType` as its swap type. See specs/044.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useBotStatusToggle } from '@/hooks/useBotMutations';
import { BotTypesEnum, BuyTypeEnum } from '@/types';

type StatusInput = Record<string, unknown>;

/** Every `changeStatus` input the hook put on the wire, in order. */
const sentInputs: StatusInput[] = [];

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  class FakeGraphQLClient {
    async request(query: string, variables?: unknown) {
      if (query.includes('changeStatus')) {
        const input = (variables as { input?: StatusInput } | undefined)?.input;
        // The transport is JSON, so `undefined` members never reach the
        // server. Round-trip through JSON so the test sees exactly the keys
        // main-app would see.
        sentInputs.push(JSON.parse(JSON.stringify(input ?? {})));
        return {
          changeStatus: {
            status: 'OK',
            reason: null,
            data: { _id: 'bot-1', status: 'open' },
          },
        };
      }
      return {};
    }
  }
  return { ...actual, GraphQLClient: FakeGraphQLClient };
});

let root: Root | null = null;
let host: HTMLElement | null = null;

function renderHook<R>(hook: () => R): () => R {
  const ref: { current: R | null } = { current: null };
  function Probe() {
    ref.current = hook();
    return null;
  }
  const el = document.createElement('div');
  document.body.appendChild(el);
  host = el;
  const r = createRoot(el);
  root = r;
  act(() => {
    r.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(Probe) as ReactNode
      ) as ReactNode
    );
  });
  return () => {
    if (ref.current === null) throw new Error('hook did not render');
    return ref.current;
  };
}

/** Let react-query settle its (real-timer) mutation. */
async function settle(ms = 150) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  sentInputs.length = 0;
  queryClient.clear();
  useAuthStore.setState({
    tokens: { accessToken: 'test-token' },
    user: { id: 'u1', email: 'tester@example.com' },
  } as never);
  useUIStore.setState({ isLiveTrading: true, tradingMode: 'live' } as never);
});

afterEach(() => {
  if (root) {
    const r = root;
    act(() => r.unmount());
    root = null;
  }
  host?.remove();
  host = null;
});

async function toggle(
  type: BotTypesEnum,
  args: Record<string, unknown>
): Promise<StatusInput> {
  const get = renderHook(() => useBotStatusToggle(type));
  await act(async () => {
    get().mutate(args as never);
  });
  await settle();
  expect(sentInputs.length).toBe(1);
  const [sent] = sentInputs;
  if (!sent) throw new Error('no status mutation was sent');
  return sent;
}

describe('bug #855 — status toggle must not invent a manual-buy mode', () => {
  // §1.1a / §1.1c — a plain combo start is not a manual buy. This is the
  // reporter's case: the backend writes a `Buy dialog` ("Manual buy") event
  // for any `buyType` it receives.
  it('sends no buyType when a combo bot is started', async () => {
    const input = await toggle(BotTypesEnum.combo, {
      id: 'bot-1',
      status: 'open',
    });
    expect('buyType' in input).toBe(false);
  });

  // §1.1a — and not on the way down either. The reporter's log has a
  // `Buy dialog` row 5ms before an `open -> closed` transition.
  it('sends no buyType when a combo bot is stopped', async () => {
    const input = await toggle(BotTypesEnum.combo, {
      id: 'bot-1',
      status: 'closed',
    });
    expect('buyType' in input).toBe(false);
  });

  it('sends no buyType when a DCA bot is started', async () => {
    const input = await toggle(BotTypesEnum.dca, {
      id: 'bot-1',
      status: 'open',
    });
    expect('buyType' in input).toBe(false);
  });

  it('sends no buyType when a hedge bot is started', async () => {
    const input = await toggle(BotTypesEnum.hedgeDca, {
      id: 'bot-1',
      status: 'open',
    });
    expect('buyType' in input).toBe(false);
  });

  // §1.2b — the deliberate exception. Grid is the one bot type whose worker
  // actually applies `buyType` (as its `swapType`), so a grid start that did
  // not come through `GridStartBotDialog` must keep sending the `all` default
  // it has always sent. Narrowing the fix to combo/DCA/hedge is what keeps
  // this a log-only change: grid behaviour is untouched.
  it('still defaults a dialog-less grid start to "all"', async () => {
    const input = await toggle(BotTypesEnum.grid, {
      id: 'bot-1',
      status: 'open',
    });
    expect(input['buyType']).toBe(BuyTypeEnum.all);
  });

  it('still defaults a grid stop to "all"', async () => {
    const input = await toggle(BotTypesEnum.grid, {
      id: 'bot-1',
      status: 'closed',
    });
    expect(input['buyType']).toBe(BuyTypeEnum.all);
  });

  // §1.1b — the legitimate path is untouched: what the user picked in
  // `GridStartBotDialog` still goes through verbatim, with its companions.
  it('forwards the buy mode the grid start dialog supplied', async () => {
    const input = await toggle(BotTypesEnum.grid, {
      id: 'bot-1',
      status: 'open',
      buyType: BuyTypeEnum.X,
      buyCount: '3',
      buyAmount: 250,
    });
    expect(input['buyType']).toBe(BuyTypeEnum.X);
    expect(input['buyCount']).toBe('3');
    expect(input['buyAmount']).toBe(250);
  });

  // An explicit `all` is a real user choice and must survive — the fix must
  // drop the *default*, not the value.
  it('forwards an explicitly chosen "all"', async () => {
    const input = await toggle(BotTypesEnum.grid, {
      id: 'bot-1',
      status: 'open',
      buyType: BuyTypeEnum.all,
    });
    expect(input['buyType']).toBe(BuyTypeEnum.all);
  });
});
