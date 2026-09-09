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

## Release ceremony — REQUIRED on every PR

Every PR that changes user-visible behavior MUST do both of these in the
same PR (not a follow-up):

1. **Bump `version` in `package.json`** following SemVer:
   - `MAJOR` (`x.0.0`) — breaking change (config schema, license-gate
     behavior, public component API contract changes).
   - `MINOR` (`2.x.0`) — new feature, new section, new setting.
   - `PATCH` (`2.8.x`) — bug fix, copy tweak, refactor with no UX delta.

2. **Add an entry at the TOP of `CHANGELOG.md`** in
   [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format:

   ```markdown
   ## [2.8.8] - YYYY-MM-DD

   ### Added | Changed | Deprecated | Removed | Fixed | Security

   - One line describing the change from a user's perspective. Reference
     the affected feature/page, not the code path.
   ```

   - Use today's date in ISO format.
   - Group bullets under the right `###` subsection. Multiple subsections
     are fine in one release.
   - Phrase bullets as observable outcomes ("Restore the reports params
     in `getNavigationSections`"), not commit subjects ("fix bug").

The downstream Docker image is tagged from `package.json` version. Skipping
the bump silently re-uses the previous tag and breaks reproducible builds.

### When to SKIP the bump

Only docs-only changes (README, CONTRIBUTING, CHANGELOG itself, LICENSE,
CLA, this CLAUDE.md, comments) and CI-only changes (`.github/`) may ship
without a version bump or CHANGELOG entry. If in doubt, bump.

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
