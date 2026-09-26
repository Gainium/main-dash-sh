/**
 * Server-side filtering for server-paged tables. Pure; no I/O.
 *
 * A table's column filters (the DataTable's `{operator, value}` states) are
 * translated into the server's `filterModel.items`. Each column declares
 * what the server can do with it in a CAPABILITY TABLE (column id → spec).
 * A filter the server cannot apply — no spec, an operator the spec does not
 * support, or a field only newer backends know — is NEVER dropped silently:
 * it keeps its chip, is marked "not applied" (or "applying…" while the
 * backend's support is still being probed), and is left out of the query.
 */
import { dateFilterBounds } from '../../components/ui/data-table/filter-logic';
import type { ServerFilterItem } from './serverBotQuery';

export type ServerFilterKind = 'text' | 'number' | 'day' | 'enum';

export interface ServerFilterSpec {
  /** Server field (Mongo path or a logical field the server resolves). */
  field: string;
  kind: ServerFilterKind;
  /**
   * Only a backend with the newer deal-list filters understands this field.
   * Older backends pass unknown fields straight to the database and return
   * nothing, so such a filter must never reach them.
   */
  requiresNewBackend?: boolean;
}

/** What the deal-list backend supports: probed once per session. */
export type FilterBackend = 'unknown' | 'new' | 'old';

export type SingleFilterStatus = 'applied' | 'pending' | 'unavailable';

type FilterStateLike = { operator?: string; value?: unknown };

const hasValue = (v: unknown): boolean =>
  !(v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0));

/** The individual filters a column holds (the DataTable stores one or many). */
export function singleFilters(columnValue: unknown): unknown[] {
  if (Array.isArray(columnValue)) {
    // An array of FilterStates, or (legacy multi-select) an array of values.
    return columnValue.every((v) => v && typeof v === 'object' && 'operator' in (v as object))
      ? columnValue
      : [{ operator: 'isAnyOf', value: columnValue }];
  }
  return hasValue(columnValue) ? [columnValue] : [];
}

function isActive(single: unknown): boolean {
  if (single && typeof single === 'object' && 'operator' in (single as object)) {
    const f = single as FilterStateLike;
    if (f.operator === 'isEmpty' || f.operator === 'isNotEmpty') return true;
    return hasValue(f.value);
  }
  return hasValue(single);
}

const NUMBER_OPS: Record<string, string> = {
  equals: '=',
  greaterThan: '>',
  lessThan: '<',
  greaterThanOrEqual: '>=',
  lessThanOrEqual: '<=',
};

const TEXT_OPS = new Set(['contains', 'equals', 'startsWith', 'endsWith']);

/**
 * Translate ONE filter into server items, or `null` when the server cannot
 * apply it (unsupported operator / value). Day filters are sent as epoch-ms
 * bounds computed in the account's timezone — the exact range the table's
 * own client-side filter uses — which every backend understands (the time
 * fields are stored as epoch ms).
 */
export function translateSingleFilter(
  spec: ServerFilterSpec,
  single: unknown,
  timeZone?: string | null
): ServerFilterItem[] | null {
  const f: FilterStateLike =
    single && typeof single === 'object' && 'operator' in (single as object)
      ? (single as FilterStateLike)
      : { operator: Array.isArray(single) ? 'isAnyOf' : 'equals', value: single };
  const op = f.operator ?? '';
  const v = f.value;
  const field = spec.field;

  switch (spec.kind) {
    case 'text':
      if (TEXT_OPS.has(op) && typeof v === 'string' && v.trim())
        return [{ field, operator: op, value: v.trim() }];
      if (op === 'isAnyOf' && Array.isArray(v) && v.length)
        return [{ field, operator: 'isAnyOf', value: v.map(String).join(',') }];
      return null;
    case 'enum':
      if ((op === 'isAnyOf' || op === 'equals') && hasValue(v))
        return [
          {
            field,
            operator: 'isAnyOf',
            value: (Array.isArray(v) ? v : [v]).map(String).join(','),
          },
        ];
      return null;
    case 'number': {
      if (op in NUMBER_OPS && hasValue(v) && Number.isFinite(Number(v)))
        return [{ field, operator: NUMBER_OPS[op], value: String(Number(v)) }];
      if (op === 'between' && Array.isArray(v) && v.length === 2) {
        const out: ServerFilterItem[] = [];
        if (hasValue(v[0]) && Number.isFinite(Number(v[0])))
          out.push({ field, operator: '>=', value: String(Number(v[0])) });
        if (hasValue(v[1]) && Number.isFinite(Number(v[1])))
          out.push({ field, operator: '<=', value: String(Number(v[1])) });
        return out.length ? out : null;
      }
      return null;
    }
    case 'day': {
      const ms = (n: number) => String(Math.round(n));
      if (op === 'between' && Array.isArray(v) && v.length === 2) {
        const from = hasValue(v[0]) ? dateFilterBounds(v[0], timeZone) : null;
        const to = hasValue(v[1]) ? dateFilterBounds(v[1], timeZone) : null;
        const out: ServerFilterItem[] = [];
        if (from) out.push({ field, operator: '>=', value: ms(from.start) });
        if (to) out.push({ field, operator: '<=', value: ms(to.end) });
        return out.length ? out : null;
      }
      if (!hasValue(v)) return null;
      const b = dateFilterBounds(v, timeZone);
      if (!b) return null;
      switch (op) {
        case 'equals':
        case 'is':
          return [
            { field, operator: '>=', value: ms(b.start) },
            { field, operator: '<=', value: ms(b.end) },
          ];
        case 'after':
          return [{ field, operator: '>', value: ms(b.end) }];
        case 'before':
          return [{ field, operator: '<', value: ms(b.start) }];
        case 'onOrAfter':
          return [{ field, operator: '>=', value: ms(b.start) }];
        case 'onOrBefore':
          return [{ field, operator: '<=', value: ms(b.end) }];
        default:
          return null;
      }
    }
  }
  return null;
}

/**
 * Needs a newer backend: a logical field only it resolves, or several items
 * on one field (a day or a range). Older backends merge a filter's items by
 * field, so only the LAST item on a field survives — a day would silently
 * become "on or before its end".
 */
function needsNewBackend(
  spec: ServerFilterSpec,
  items: ServerFilterItem[]
): boolean {
  if (spec.requiresNewBackend) return true;
  const fields = items.map((i) => i.field);
  return new Set(fields).size !== fields.length;
}

/** Whether (and how) one filter reaches the server. */
export function singleFilterStatus(
  spec: ServerFilterSpec | undefined,
  single: unknown,
  backend: FilterBackend,
  timeZone?: string | null
): SingleFilterStatus {
  if (!spec) return 'unavailable';
  const items = translateSingleFilter(spec, single, timeZone);
  if (!items) return 'unavailable';
  if (needsNewBackend(spec, items)) {
    if (backend === 'unknown') return 'pending';
    if (backend === 'old') return 'unavailable';
  }
  return 'applied';
}

export interface ResolvedServerFilters {
  /** Items to send (only filters the server applies). */
  items: ServerFilterItem[];
  /** Some filter waits for the backend probe (hold the filtered fetch). */
  pending: boolean;
  /** Filters shown but not applied, as `columnId` list (for messaging/tests). */
  unapplied: string[];
  /** Status of each filter object resolved here (by identity). */
  statusOf: Map<unknown, SingleFilterStatus>;
}

/** Resolve a table's column filters against a capability table. */
export function resolveServerFilters(
  columnFilters: ReadonlyArray<{ id: string; value: unknown }>,
  specs: Record<string, ServerFilterSpec>,
  backend: FilterBackend,
  timeZone?: string | null
): ResolvedServerFilters {
  const items: ServerFilterItem[] = [];
  const unapplied: string[] = [];
  const statusOf = new Map<unknown, SingleFilterStatus>();
  let pending = false;
  for (const cf of columnFilters) {
    for (const single of singleFilters(cf.value)) {
      if (!isActive(single)) continue;
      const spec = specs[cf.id];
      let status = singleFilterStatus(spec, single, backend, timeZone);
      const own =
        status === 'applied' && spec
          ? (translateSingleFilter(spec, single, timeZone) ?? [])
          : [];
      // Older backends keep only one item per field: a second filter on a
      // field already sent would silently replace the first.
      if (
        status === 'applied' &&
        backend !== 'new' &&
        own.some((i) => items.some((x) => x.field === i.field))
      ) {
        status = backend === 'unknown' ? 'pending' : 'unavailable';
      }
      if (single && typeof single === 'object') statusOf.set(single, status);
      if (status === 'applied') {
        items.push(...own);
      } else if (status === 'pending') {
        pending = true;
        unapplied.push(cf.id);
      } else {
        unapplied.push(cf.id);
      }
    }
  }
  return { items, pending, unapplied, statusOf };
}
