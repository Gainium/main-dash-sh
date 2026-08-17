/* eslint-disable @typescript-eslint/no-explicit-any */
// New human-readable URL serializer
// - Sorting format: comma-separated list: "-id,otherId" (leading '-' is desc)
// - Filters format: pipe-separated list: "col:operator:value|col:operator" (value is optional for isEmpty/isNotEmpty)
// Value part is encoded with `encodeURIComponent` to avoid clashes with separators.
// Backwards compatibility: if input looks like base64, try base64 decode and JSON.parse.

const looksLikeBase64 = (s: string) => /^[A-Za-z0-9_-]+$/.test(s);

// Operators whose value is an ARRAY, not a scalar. Only needed now to read
// LEGACY links, written before values carried a type marker; new links encode
// arrays as JSON so the shape is explicit.
const MULTI_VALUE_OPERATORS = new Set(['isAnyOf', 'isNoneOf', 'between']);

const NO_VALUE_OPERATORS = new Set(['isEmpty', 'isNotEmpty']);

/**
 * Read the value part of a legacy multi-value filter back into an array.
 * Handles both the pre-JSON format (each element encoded, joined with a literal
 * `,`) and older links still, where the whole array was flattened with
 * `String()` and encoded once, so the separators arrived as `%2C` and the
 * elements as one blob.
 */
const parseMultiValue = (raw?: string): string[] => {
  if (!raw) return [];
  if (raw.includes(',')) return raw.split(',').map((p) => decodeURIComponent(p));
  const decoded = decodeURIComponent(raw);
  return decoded.includes(',') ? decoded.split(',') : [decoded];
};

// Non-string filter values (numbers, booleans, arrays) must survive the round
// trip as their original type — filter-logic picks the numeric-vs-date branch
// of `between` off `typeof value[0] === 'number'`, so stringifying [10, 20]
// would silently turn a number range into a date comparison. Those are written
// as JSON behind a `~` marker; plain strings stay unwrapped so shared links
// remain readable. A string that itself starts with `~` is JSON-encoded too, so
// the marker is never ambiguous.
const JSON_VALUE_MARKER = '~';

const encodeFilterValue = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' && !value.startsWith(JSON_VALUE_MARKER)) {
    return encodeURIComponent(value);
  }
  return JSON_VALUE_MARKER + encodeURIComponent(JSON.stringify(value));
};

const decodeFilterValue = (
  raw: string | undefined,
  operator: string
): unknown => {
  if (raw === undefined || raw === '') {
    return MULTI_VALUE_OPERATORS.has(operator) ? [] : '';
  }
  if (raw.startsWith(JSON_VALUE_MARKER)) {
    try {
      return JSON.parse(decodeURIComponent(raw.slice(1)));
    } catch {
      return decodeURIComponent(raw.slice(1));
    }
  }
  // Legacy link: arrays were comma-joined, everything else was a bare string.
  return MULTI_VALUE_OPERATORS.has(operator)
    ? parseMultiValue(raw)
    : decodeURIComponent(raw);
};

/**
 * Split `id:operator:value` without touching separators inside the value — the
 * value is percent/JSON encoded, but the id and operator never contain a `:`,
 * so only the first two colons are significant.
 */
const splitSegment = (
  segment: string
): { id: string; operator?: string; raw?: string } => {
  const firstColon = segment.indexOf(':');
  if (firstColon === -1) return { id: segment };
  const id = segment.slice(0, firstColon);
  const rest = segment.slice(firstColon + 1);
  const secondColon = rest.indexOf(':');
  if (secondColon === -1) return { id, operator: rest };
  return {
    id,
    operator: rest.slice(0, secondColon),
    raw: rest.slice(secondColon + 1),
  };
};

/**
 * Flatten one column filter into its individual conditions. A column's filter
 * value is normally an ARRAY of `{operator, value}` conditions — the shape the
 * quick-filter UI writes, ANDed together by the filter fn — but legacy state
 * can hold a single condition object or a bare string.
 */
const conditionsOf = (
  value: unknown
): { operator: string; value?: unknown }[] => {
  const list = Array.isArray(value) ? value : [value];
  return list.flatMap((entry) => {
    if (
      typeof entry === 'string' ||
      typeof entry === 'number' ||
      typeof entry === 'boolean'
    ) {
      return [{ operator: 'contains', value: entry }];
    }
    if (entry && typeof entry === 'object' && 'operator' in entry) {
      const cond = entry as { operator: unknown; value?: unknown };
      return [{ operator: String(cond.operator), value: cond.value }];
    }
    return [];
  });
};

export const serializeFilters = (filters: unknown) => {
  if (!Array.isArray(filters) || filters.length === 0) return '';
  const parts = (filters as any[]).flatMap((f) => {
    if (!f || typeof f !== 'object') return [];
    const id = String(f.id ?? '');
    if (!id) return [];
    // A condition we can't describe is dropped rather than written as a bare
    // `id`. That valueless token used to read back as a filter with no value,
    // which wiped the real filters on the next load.
    return conditionsOf(f.value).map(({ operator, value }) =>
      NO_VALUE_OPERATORS.has(operator)
        ? `${id}:${operator}`
        : `${id}:${operator}:${encodeFilterValue(value)}`
    );
  });
  return parts.filter(Boolean).join('|');
};

export const deserializeFilters = <T>(v: string | null): T | null => {
  if (!v) return null;
  // Try human-readable format first (presence of ':' or '|')
  if (v.includes(':') || v.includes('|')) {
    try {
      // Conditions are emitted one per segment, so several segments can share a
      // column id; regroup them into that column's array of conditions.
      const byColumn = new Map<
        string,
        { operator: string; value?: unknown }[]
      >();
      for (const segment of v.split('|')) {
        const { id, operator, raw } = splitSegment(segment);
        if (!id || !operator) continue;
        const condition = NO_VALUE_OPERATORS.has(operator)
          ? { operator }
          : { operator, value: decodeFilterValue(raw, operator) };
        const existing = byColumn.get(id);
        if (existing) existing.push(condition);
        else byColumn.set(id, [condition]);
      }
      if (byColumn.size === 0) return null;
      const parts = Array.from(byColumn, ([id, conditions]) => ({
        id,
        value: conditions,
      }));
      return parts as unknown as T;
    } catch {
      // fallthrough to other strategies
    }
  }

  // Fallback: JSON or base64
  try {
    return JSON.parse(decodeURIComponent(v as string)) as T;
  } catch {
    // try base64 decode
    try {
      if (looksLikeBase64(v)) {
        const pad = (4 - (v.length % 4)) % 4;
        const base64 = (v + '='.repeat(pad))
          .replace(/-/g, '+')
          .replace(/_/g, '/');
        // atob is available in browsers; fallback decodeURIComponent for node tests
        const decoded =
          typeof atob === 'function'
            ? decodeURIComponent(escape(atob(base64) as unknown as string))
            : Buffer.from(base64, 'base64').toString('utf8');
        return JSON.parse(decoded) as T;
      }
    } catch {
      // final fallthrough
    }
  }
  return null;
};

export const serializeSorting = (sorting: unknown) => {
  if (!Array.isArray(sorting) || sorting.length === 0) return '';
  const parts = (sorting as any[]).map((s) => {
    if (!s || typeof s !== 'object') return '';
    const id = String(s.id ?? s.columnId ?? '');
    const desc = !!s.desc;
    return `${desc ? '-' : ''}${id}`;
  });
  return parts.filter(Boolean).join(',');
};

export const deserializeSorting = <T>(v: string | null): T | null => {
  if (!v) return null;
  try {
    const parts = v
      .split(',')
      .map((p) => {
        if (!p) return null;
        const desc = p.startsWith('-');
        const id = desc ? p.slice(1) : p;
        return { id, desc };
      })
      .filter(Boolean);
    return parts as unknown as T;
  } catch {
    // fallthrough to other strategies
  }

  // Fallback JSON/base64
  try {
    return JSON.parse(decodeURIComponent(v as string)) as T;
  } catch {
    try {
      if (looksLikeBase64(v)) {
        const pad = (4 - (v.length % 4)) % 4;
        const base64 = (v + '='.repeat(pad))
          .replace(/-/g, '+')
          .replace(/_/g, '/');
        const decoded =
          typeof atob === 'function'
            ? decodeURIComponent(escape(atob(base64) as unknown as string))
            : Buffer.from(base64, 'base64').toString('utf8');
        return JSON.parse(decoded) as T;
      }
    } catch {
      // final fallthrough
    }
  }
  return null;
};

// Generic serialize/deserialize that detects type and uses readable format, with fallback
export const serialize = (v: unknown) => {
  if (Array.isArray(v) && v.length > 0) {
    const first = v[0];
    if (first && typeof first === 'object' && 'desc' in first)
      return serializeSorting(v);
    if (first && typeof first === 'object' && 'value' in first)
      return serializeFilters(v);
  }
  return encodeURIComponent(JSON.stringify(v));
};

export const deserialize = <T>(v: string | null): T | null => {
  if (!v) return null;

  // Try to detect filters vs sorting vs JSON
  if (v.includes(':') || v.includes('|')) {
    return deserializeFilters<T>(v);
  }
  // Try parsing as a sorting value (single token or comma-separated)
  const sortingAttempt = deserializeSorting<T>(v);
  if (sortingAttempt) return sortingAttempt;

  // Try JSON
  try {
    return JSON.parse(decodeURIComponent(v as string)) as T;
  } catch {
    // Fallback to base64
    try {
      if (looksLikeBase64(v)) {
        const pad = (4 - (v.length % 4)) % 4;
        const base64 = (v + '='.repeat(pad))
          .replace(/-/g, '+')
          .replace(/_/g, '/');
        const decoded =
          typeof atob === 'function'
            ? decodeURIComponent(escape(atob(base64) as unknown as string))
            : Buffer.from(base64, 'base64').toString('utf8');
        return JSON.parse(decoded) as T;
      }
    } catch {
      // final fallthrough
    }
  }
  return null;
};

export default {
  serializeFilters,
  deserializeFilters,
  serializeSorting,
  deserializeSorting,
  serialize,
  deserialize,
};
