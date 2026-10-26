/**
 * An indicator's price-behaviour data (content API `GET /indicators/:slug` →
 * `edge`), for the bot form's indicator editors. One request per slug per
 * session; any failure reads as "no data".
 */
import { useEffect, useState } from 'react';
import { getIndicator } from '@/services/contentApi';
import type { IndicatorEdge } from '@/types/helpCenter';
import type { IndicatorDefinition } from '@/types/indicators/indicatorTypes';
import { parseHelpUrl } from '@/utils/helpUrl';
import { sanitizeIndicatorEdge } from '@/utils/indicatorEdge';

const pending = new Map<string, Promise<IndicatorEdge | null>>();
const settled = new Map<string, IndicatorEdge | null>();

/** The edge data of an indicator page, fetched once per slug. */
export function loadIndicatorEdge(slug: string): Promise<IndicatorEdge | null> {
  let request = pending.get(slug);
  if (!request) {
    request = getIndicator(slug)
      .then((doc) => sanitizeIndicatorEdge(doc.edge) ?? null)
      .catch(() => null)
      .then((edge) => {
        settled.set(slug, edge);
        return edge;
      });
    pending.set(slug, request);
  }
  return request;
}

/** Tests only: forget every cached page. */
export function resetIndicatorEdgeCache(): void {
  pending.clear();
  settled.clear();
}

/** The article slug the indicator's help chip opens, if any. */
export function indicatorEdgeSlug(
  definition: IndicatorDefinition | null | undefined
): string | null {
  return parseHelpUrl(definition?.documentationUrl).helpSlug;
}

/** The indicator's edge data, or null while loading, without data, or on error. */
export function useIndicatorEdge(
  definition: IndicatorDefinition | null | undefined
): { edge: IndicatorEdge | null; slug: string | null } {
  const slug = indicatorEdgeSlug(definition);
  const [edge, setEdge] = useState<IndicatorEdge | null>(() =>
    slug ? (settled.get(slug) ?? null) : null
  );

  useEffect(() => {
    if (!slug) {
      setEdge(null);
      return undefined;
    }
    let active = true;
    setEdge(settled.get(slug) ?? null);
    void loadIndicatorEdge(slug).then((next) => {
      if (active) setEdge(next);
    });
    return () => {
      active = false;
    };
  }, [slug]);

  return { edge, slug };
}
