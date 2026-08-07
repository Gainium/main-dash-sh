# Design System — main-dash-redesign

This document is the **source of truth** for visual conventions in this app.
It exists because the dashboard accumulated many ad-hoc surfaces over time with
no consistent vocabulary. Read it before adding new components or new colors.

If something here conflicts with what's already in the code, the doc wins — the
code is the migration target.

---

## 1. Principles

1. **Elevation is conveyed by lightness, not shadow.** Especially in dark mode.
   Higher = lighter. Lower = darker (toward the page background).
2. **Max 3 surface levels in any subtree, + 1 floating overlay.** If you find
   yourself wanting a 4th level, you're using the wrong tool — use spacing,
   typography, or a `muted` inner fill instead.
3. **Borders are a last resort, not a default.** See §3.
4. **Interactive elements (chips, buttons, inputs) do not introduce their own
   elevation level.** They live on their container's surface and signal
   interactivity through *color role* or border (inputs only).
5. **One source of truth: CSS variables.** Never hardcode a hex or `bg-zinc-*`.
   Never reach for `dark:bg-*` — the variable already switches.
6. **Be palette-safe.** Color palettes (`ocean`, `banana`, etc.) tint only the
   *primary/brand/gradient*. Surface and text tokens must remain neutral so the
   app reads correctly under every palette.

---

## 2. The surface ladder

Four named surfaces. That's it. Use the *semantic alias* in code (e.g.
`bg-card`), not the numeric one — the numeric layer is the underlying scale.

| Level | Token (numeric)     | Semantic alias | When to use                                                  |
|-------|---------------------|----------------|--------------------------------------------------------------|
| 0     | `--surface-base`    | `background`   | The page canvas. The thing the app sits on.                  |
| 1     | `--surface-1`       | `card`         | Default raised surface: cards, panels, widgets, sidebars.    |
| 2     | `--surface-2`       | `popover`      | Floating surfaces: dropdowns, popovers, modals, sheets.      |
| —     | `--surface-muted`   | `muted`        | *Inner fill* inside a surface: chip bg, input bg, disabled, subtle inner block. **Not an elevation level** — it's a same-level filled region. |

### Concrete values

All surface tokens share a single fixed hue (`--surface-hue: 47`, the brand
orange) and a tiny chroma (≤0.002). Only the lightness changes between levels.
The chroma is so low that surfaces read as neutral grays — never as orange —
they just feel like they "belong to the brand."

**Light mode** — depth goes *toward white* as you nest. Page = light gray, cards = white.

| Token              | Value                                  | Notes                                            |
|--------------------|----------------------------------------|--------------------------------------------------|
| `--surface-base`   | `oklch(0.970 0.002 47)`                | Page canvas.                                     |
| `--surface-1`      | `oklch(1.000 0 0)`                     | Pure white card. No tint at L=1.                 |
| `--surface-2`      | `oklch(1.000 0 0)` + `shadow-md`       | Same color as `--surface-1`; shadow lifts it.    |
| `--surface-muted`  | `oklch(0.955 0.002 47)`                | Sunken inset inside white cards.                 |

**Dark mode** — depth goes *toward white* as you nest. ~5–6% L step per level.
Never pure black. Tiny warm tint to prevent "muddy gray soup."

| Token              | Value                                  | L step vs prev | Notes                                      |
|--------------------|----------------------------------------|----------------|--------------------------------------------|
| `--surface-base`   | `oklch(0.145 0.002 47)`                | —              | Near-black. Never use pure `#000`.         |
| `--surface-1`      | `oklch(0.205 0.002 47)`                | +6.0%          | Default card. Clearly above base.          |
| `--surface-2`      | `oklch(0.260 0.002 47)`                | +5.5%          | Popovers, modals. Above cards.             |
| `--surface-muted`  | `oklch(0.245 0.002 47)`                | (+4% from L1)  | Inner fill inside cards.                   |

### Nesting rules

1. A card on `--surface-base` uses `--surface-1`. Two levels apart.
2. **Card-inside-card is allowed once** — outer = `--surface-1`, inner = `--surface-muted` (an inset within the outer surface). Do not introduce a third *full* card.
3. Modal/popover ignores the local stack — it lifts to `--surface-2` regardless.
4. **If you want a third nested surface, stop.** Use spacing, a typographic
   heading, or a horizontal rule inside the same surface instead.

---

## 3. Borders — avoid by default

> **The agent's default style is too border-heavy. Borders should be the
> exception, not the rule.** Reach for elevation, spacing, and typography
> first.

### When a border IS justified

Borders carry real signal in these cases. Use them.

- **Form inputs** (text, select, textarea, combobox). Affordance + a11y.
- **Focus rings** (`ring-2 ring-ring`). Never remove.
- **Outlined button variant** — when explicitly low-emphasis vs. a fill.
- **Tinted state pills** (e.g. `bg-success/10` with `border-success/20`). The
  fill alone is too faint; the matching tinted border completes the chip.
- **Peer surfaces at the same elevation** that need separation in a dense grid
  (e.g. table cells, side-by-side cards on the same background where spacing
  alone is not enough).
- **Sticky headers / table dividers** — a single hairline to mark the edge.

### When a border is NOT justified

- **Around a card** that already has a different background from its parent.
  The surface contrast IS the separator. Remove the border.
- **Around chips, badges, or pills** that have a fill (solid or tinted).
- **Around buttons** (use the fill color of the variant).
- **To separate sections inside a card.** Use vertical spacing
  (`space-y-md`) and section headings.
- **Around icon-only buttons.**
- **Around tabs.** Use the active-state underline/fill.
- **Around tooltips** that already have `--surface-2` + shadow.

### Rule of thumb

> *Before adding a border, ask: can I separate these using surface contrast,
> spacing, or typography?* If yes, do that instead. A border is the **fourth**
> option, not the first.

---

## 4. Chips, buttons, inputs inside cards

Inner interactive elements **do not add an elevation level**. They sit on the
card and signal interactivity through *color role*, not depth.

| Element        | Recommended treatment                                                          |
|----------------|--------------------------------------------------------------------------------|
| Chip / badge   | `bg-muted` (or `bg-{role}/10`). No border. Use `text-{role}` for tinted ones.  |
| Outline chip   | Only when conveying status that needs the matching tinted border.              |
| Button (primary) | `bg-primary text-primary-foreground`. No border.                             |
| Button (secondary) | `bg-secondary` / `bg-muted`. No border.                                    |
| Button (ghost) | Transparent + hover `bg-muted`. No border.                                     |
| Button (outline) | `border border-border` over transparent. The one border case.                |
| Input          | `bg-background` (or `bg-muted` for filled style) + `border border-input`.      |
| Select / combobox | Same as input.                                                              |
| Toggle group   | Container has `bg-muted`. Selected item has `bg-card` (one step up, no border). |

Notice the pattern: **inputs are the only inner element that gets a border by
default.** Everything else uses fill role.

---

## 5. Naming map — old → new

Existing tokens stay as **public aliases** so the 738+ existing `bg-muted` /
`bg-card` / `bg-popover` usages keep working. The numeric ladder is the
underlying scale.

| Existing token         | Aliased to              | Notes                                                  |
|------------------------|-------------------------|--------------------------------------------------------|
| `--color-background`   | `--surface-base`        | No change in role.                                     |
| `--color-card`         | `--surface-1`           | **Value changes in dark mode** (0.252 → 0.205).        |
| `--color-popover`      | `--surface-2`           | **Value changes in dark mode** (0.265 → 0.260, also drops the red tint to match the cool hue). |
| `--color-muted`        | `--surface-muted`       | **Value changes in dark mode** (0.285 → 0.255).        |
| `--color-inner-container` | `--surface-muted` (deprecated) | Will be removed. Use `bg-muted` instead.         |

The numeric tokens (`--surface-base`, `--surface-1`, `--surface-2`,
`--surface-muted`) are available for new code that wants to be explicit about
the elevation layer. For most code, prefer the semantic aliases.

---

## 6. Anti-patterns

Examples that violate the rules above. Don't ship these.

- ❌ `<Card className="bg-card border border-border"><Card className="bg-muted border border-border">…</Card></Card>`
  Three borders + two surfaces for one nested card. **Fix:** drop the outer
  border, drop the inner border. Surface contrast is enough.

- ❌ A chip with `bg-muted border border-border rounded-full px-2`. **Fix:**
  remove the border. `bg-muted` alone is enough; chips don't need outlines.

- ❌ Wrapping every form section in `border border-border rounded-lg p-4`.
  **Fix:** use a heading + `space-y-md`. The border is doing nothing the
  spacing can't do.

- ❌ `dark:bg-zinc-900 bg-white`. **Fix:** use `bg-card`. The variable
  already does the dark switch.

- ❌ A modal at `--surface-1` because "it's just a card." **Fix:** modals
  lift to `--surface-2`. Always.

- ❌ A 4th-level nested card. **Fix:** rethink the layout. You've lost the
  user; they can't see the hierarchy.

---

## 7. Verification

After any surface, border, or color change in code:

1. Eyeball the **`/ui-showcase` page** in both light and dark modes.
2. Confirm: cards on the page are clearly separable from the canvas without
   any added border.
3. Confirm: a popover/modal sits visibly above its trigger card.
4. Confirm: no chip, badge, or button has both a fill *and* a border (except
   tinted state pills, where they match).
5. Toggle through the 10 color palettes — surfaces and text must not visibly
   shift in hue. Only primary/brand/gradient should change.

---

## 8. Where to find things

- Tokens: [src/index.css](src/index.css) — `@theme` (light) and
  `[data-theme='dark']` blocks.
- Surface previews: [src/pages/UIShowcase.tsx](src/pages/UIShowcase.tsx) →
  *Surfaces* and *Borders & Focus* sections.
- Card primitive: [src/components/ui/card.tsx](src/components/ui/card.tsx).

When updating tokens, **update the showcase first** with a scoped preview, get
visual sign-off, then change the global tokens.

---

## 9. Spacing — the density scale

The app has one spacing scale: **`xs · sm · md · lg · xl`**. It is
density-aware: every token is a CSS variable that `.spacing-comfortable` and
`.spacing-compact` redefine at runtime, so a user switching density restyles
the whole app with no rebuild.

```
p-md   px-lg  py-sm  pt-xs  pb-md  pl-sm  pr-lg  ps-xs  pe-md
m-md   mx-lg  my-sm  mt-xs  mb-md  ml-sm  mr-lg  ms-xs  me-md
gap-md gap-x-sm gap-y-lg     space-x-sm  space-y-lg
```

Every family above works with **every variant** — `md:p-lg`, `sm:gap-xs`,
`hover:mb-md` all compile.

**Prefer the named scale over numbers.** `p-4` is a fixed 16px that ignores
the user's density setting; `p-md` follows it. Tailwind's numeric scale still
works and is not banned — reach for it only when a value genuinely must not
scale (hairlines, icon-sized boxes, optical nudges).

### The trap this scale was built around

Tailwind v4 takes its configuration from `src/index.css` — **there is no
`tailwind.config.js`**, and a v3-style config file would be read only if a
`@config` directive pointed at it. For a long time this repo had one that
nothing loaded. The consequences were invisible, because **Tailwind emits no
CSS and no warning for a utility it does not recognise**: the class lands in
the DOM, matches no rule, and silently does nothing.

That produced two live bugs:

- `mt-*`, `mb-*`, `ml-*`, `mr-*`, `pt-*`, `pb-*`, `pl-*`, `pr-*` were never
  defined for the named tokens, and *every* variant-prefixed spacing class
  (`md:p-md`, `sm:space-y-lg`) was dead as well — because hand-written CSS in
  a `@layer` cannot be varied by Tailwind. ~600 class usages across 140 files
  rendered as nothing.
- `dark:` compiled to `@media (prefers-color-scheme: dark)` and followed the
  operating system instead of the in-app theme toggle.

Both are now asserted by **`npm run verify:css`**, which compiles
`src/index.css` and checks that every family × token emits a rule, that each
one keeps its `var(--spacing-*)` reference (a baked literal would break
density switching), that variants compile, and that `dark:` keys off
`[data-theme]`. It runs in CI and on pre-commit. If you add a spacing family,
add it to that script's `FAMILIES` list too.

`spacing/no-unknown-spacing-token` (ESLint) catches the other half: a token
outside the scale, like `mb-huge` or `py-2xl`, fails lint instead of silently
rendering as zero.

### Two rules when adding spacing utilities

1. **Declare tokens under `--space-*`, never `--spacing-*`.** `--spacing-*` is
   Tailwind's own namespace and also backs `max-w-*`, `w-*`, `size-*` and
   `basis-*`. Putting our tokens there rewrites `max-w-md` from
   `--container-md` (28rem) to a spacing value and collapses every such
   container in the app.
2. **Use `@utility`, not a class in `@layer utilities`.** Only `@utility`
   registers the class with Tailwind so variants work.

### Don't stack a named class and a numeric one

`class="space-y-3 space-y-lg"` is ambiguous — `tailwind-merge` does not
recognise the named form, so both survive into the DOM and the cascade picks
the winner. Pick one.
