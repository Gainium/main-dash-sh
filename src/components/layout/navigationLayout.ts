import type { NavigationSection } from './navigationConfig';

/**
 * Persisted, user-customizable navigation layout for the V1 sidebar.
 *
 * A layout is an ordered list of sections; each section is an ordered list of
 * top-level item ids. Items are resolved at render time against the live item
 * registry (built-in nav items from `getNavigationSections` + user custom nav
 * items). This lets the user reorder items, move them between sections, create
 * their own sections, and drop in custom links — all while new built-in items
 * shipped in a release still surface automatically (see `reconcileLayout`).
 */
export interface NavLayoutSection {
  /** Stable id. `root` for the title-less top group; slug of the title for
   *  built-in sections; `custom-sec-<ts>` for user-created sections. */
  id: string;
  /** Display title. Empty string for the root group (renders no header). */
  title: string;
  /** Ordered top-level item ids living in this section. */
  itemIds: string[];
  /** User-created section (renamable / deletable). */
  isCustom?: boolean;
}

/** The title-less group at the very top of the sidebar (Overview, etc.). */
export const ROOT_SECTION_ID = 'root';

/** Marks a user-created custom nav item (matches the id minted by the store). */
export const isCustomNavItemId = (id: string): boolean =>
  id.startsWith('custom-nav-');

/** Marks a user-created section. */
export const isCustomSectionId = (id: string): boolean =>
  id.startsWith('custom-sec-');

export const sectionIdFromTitle = (title: string): string =>
  title ? title.toLowerCase().replace(/\s+/g, '-') : ROOT_SECTION_ID;

/**
 * Build the default layout from the static section config. The result mirrors
 * the shipped sidebar exactly and is used both as the "no customization yet"
 * baseline and as the source of truth for re-homing newly added built-ins.
 */
export const buildDefaultLayout = (
  sections: NavigationSection[]
): NavLayoutSection[] =>
  sections.map((section) => ({
    id: sectionIdFromTitle(section.title),
    title: section.title,
    itemIds: section.items
      .map((item) => item.id)
      .filter((id): id is string => Boolean(id)),
  }));

/**
 * Merge a persisted layout with the live set of available item ids so that:
 *  - items that no longer exist (deleted custom items, removed built-ins)
 *    drop out,
 *  - built-in items added in a newer release appear in their default section
 *    (or the last section if that section was deleted),
 *  - custom items that aren't placed anywhere yet land in the last section.
 *
 * Passing a null/empty `persisted` returns a clean copy of the default layout
 * (still reconciled, so stray custom items get appended).
 */
export const reconcileLayout = (
  persisted: NavLayoutSection[] | null | undefined,
  defaultLayout: NavLayoutSection[],
  availableItemIds: Set<string>
): NavLayoutSection[] => {
  const source = persisted && persisted.length > 0 ? persisted : defaultLayout;

  const base: NavLayoutSection[] = source.map((section) => ({
    ...section,
    itemIds: section.itemIds.filter((id) => availableItemIds.has(id)),
  }));

  // The root group always exists (it holds the top items and never renders a
  // header). Recreate it if a persisted layout somehow dropped it.
  if (!base.some((section) => section.id === ROOT_SECTION_ID)) {
    base.unshift({ id: ROOT_SECTION_ID, title: '', itemIds: [] });
  }

  const placed = new Set(base.flatMap((section) => section.itemIds));

  // Default home for each built-in id, used to re-home items we haven't placed.
  const defaultSectionForItem = new Map<string, string>();
  for (const section of defaultLayout) {
    for (const id of section.itemIds) {
      defaultSectionForItem.set(id, section.id);
    }
  }

  const missing = [...availableItemIds].filter((id) => !placed.has(id));
  for (const id of missing) {
    const targetSectionId = defaultSectionForItem.get(id);
    const target =
      (targetSectionId &&
        base.find((section) => section.id === targetSectionId)) ||
      base[base.length - 1];
    target.itemIds.push(id);
  }

  return base;
};
