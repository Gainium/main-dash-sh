# Agent guide — main-dash-sh

## 📚 Platform knowledge base

A curated, auto-updated AI-agent knowledge base for the **whole Gainium platform** lives in the
private repo **`gainium-0-knowledge`** (`github.com/aressanch/gainium-0-knowledge`).
Local checkouts — Mac: `~/Git/Gainium Local/0-knowledge` · VPS: `/root/git/0-knowledge`.

Consult it before non-trivial work: `ARCHITECTURE.md` (service graph + danger boundaries),
`subsystems/<area>.md` (how each area works & breaks), `bug-patterns/`, `runbooks/`,
`domain/glossary.md`. Query 3.7k historical bugs by symptom:
`python3 <kb>/_raw/scripts/bugs.py find "<terms>"`. It is auto-enriched daily from agent session digests.

This is the self-hosted Gainium dashboard. Public repo, FCL-1.0-Apache-2.0
licensed. Cloud overlay (`main-dash-redesign`) consumes this repo as a
`core/` submodule, so changes here ship to both self-hosted users and the
hosted cloud product.

## 🧹 UI copy rule — no explanations in the UI, only in tooltips

Keep the interface clean. **Explanatory text never sits in the UI; it goes in a tooltip.**

- **Allowed on screen:** labels, values, units, button text, and short one-line validation errors.
- **Explanations go in a tooltip:** what a setting does, how it interacts with others, caveats, "this is kept when…".
  Use `SettingsRow`'s `tooltip` prop, or `<Tooltip tooltip="…"><InfoIcon /></Tooltip>` next to a label.
- **Not allowed:**
  - helper paragraphs under a field ("Counts the base order…");
  - info alerts that describe behaviour;
  - intro sentences in dialogs ("Saving turns on… These deals change:");
  - "why" sentences after a label.
- **Only exception:** a destructive confirmation may keep ONE line saying it cannot be undone.
- **Don't render empty data:** if a row or field has no value (no TP, no SL, nothing to compare), leave it
  out. Never show "—" placeholders for things that don't apply.
- Before adding any visible sentence, ask whether it could be a tooltip. The answer is almost always yes.

## Release ceremony — REQUIRED on every PR

Every PR that changes user-visible behavior adds ONE entry under
[`.changes/`](.changes/README.md) in the same PR (not a follow-up):

```markdown
---
bump: patch
section: Fixed
---
- One line describing the change from a user's perspective.
```

- `bump`: `patch` — bug fix, copy tweak, refactor with no UX delta;
  `minor` — new feature, new section, new setting. A breaking change
  (config schema, license-gate behavior, public component API contract)
  needs the maintainers' explicit direction.
- `section`: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed` or `Security`.
- Phrase bullets as observable outcomes ("Restore the reports params in
  `getNavigationSections`"), not commit subjects ("fix bug"). Reference the
  affected feature/page, not the code path.

**Never edit `version` in `package.json` or add a `## [x.y.z]` section to
`CHANGELOG.md` yourself.** Both are assigned when the change is released,
from whatever version `main` is at by then, so changes made at the same time
never collide on a number or conflict in `CHANGELOG.md`. A pre-push hook
refuses hand-set versions. The downstream Docker image is still tagged from
the released `package.json` version.

### When to SKIP the entry

Only docs-only changes (README, CONTRIBUTING, LICENSE, CLA, this CLAUDE.md,
comments) and CI-only changes (`.github/`) may ship without a `.changes/`
entry. If in doubt, add one.

## Before pushing

CI runs `npm run type-check` then `npm run lint` on every PR (including
drafts). Run them locally first:

```bash
npm run type-check
npm run lint
```

Both must pass. `lint:check` (used internally) is stricter — it fails on
any warning, not just errors.

## Commit messages

Follow the repo's existing commit style — see recent `git log` for the
convention. Co-author trailers are fine; the CLA workflow allowlists the
common AI assistant emails.

This repository is public, and so is its history. A commit message describes
the change and why the old behaviour was wrong, in the code's own terms. Keep
out of it anything that is not about the code: tracker or ticket numbers and
links, support threads, user names, ids or account details, figures taken from
live accounts, and internal tooling. History cannot be cleaned afterwards
without rewriting it, so write it right the first time.

## Things this repo does NOT do

- No mocks of the trading backend; integration tests hit a real `app-sh`.
- No backwards-compat shims for removed feature flags — delete cleanly.
- No `*.tsbuildinfo` committed — `.gitignore` covers it; if you see one
  staged, drop it before pushing.
