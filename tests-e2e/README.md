# tests-e2e — browser specs against a real backend

These specs drive the **real dashboard** in a real browser against a **real
API**. They are deliberately separate from `tests/` (which
`npm run test:unit` picks up) because they need three things CI does not have:
a running dev server, a minted user JWT, and an account whose bots they are
allowed to create and delete.

Nothing here runs automatically. Run them by hand when you are changing the
save/create path and want proof that goes past the mapper boundary.

## Running

```bash
# 1. claim a port, mint a JWT, and boot a dev server on it
~/.claude/skills/gainium-bug-fix/iso-preview.sh \
  --frontend remote --user-id 66a7c2e389077cfe78306877 \
  --reason "<why you need a session>"
# → prints PREVIEW_NAME=iso-<port>; start it with preview_start("iso-<port>")

# 2. point the specs at that slot and run them
cd core
E2E_TOKEN_FILE=<repo>/.claude/dev-token.<port>.json \
E2E_PORT=<port> \
  npx playwright test --config=tests-e2e/playwright.e2e.config.ts
```

| Variable | Meaning |
|---|---|
| `E2E_TOKEN_FILE` | **Required.** Path to the minted `dev-token.<port>.json`. Supplies the JWT, the API endpoint, and the user id. |
| `E2E_PORT` | Dev-server port. Defaults to `7500`. |
| `E2E_API` | Overrides the API endpoint from the token file. |
| `E2E_PAPER` | Set to `false` to drop the `paper-context` header. **Don't**, unless you mean to touch live bots. |

Two independent runs must not share a port or a token file — `iso-preview.sh`
claims a free one in 7500–7510 and writes a per-port token for exactly that
reason. They also should not run concurrently at all: they share one account,
and `test-results/` is a single directory that Playwright clears at startup.

## The things that cost a debugging round

- **paper vs live is decided per request by the `paper-context: true` header.**
  Nothing on the user record selects it. Omit it and a paper account's bots come
  back as an empty list with status `OK` — which reads exactly like "this
  account has no bots" rather than "you asked the wrong context". `helpers/api.ts`
  sends it by default.
- **main-app authenticates from the `token` header, not `Authorization: Bearer`.**
  The wrong one does not 401; it answers 200 with a `NOTOK` envelope inside
  `data`.
- **The edit form opens locked** — "Fields are locked. Press Edit to make
  changes." Save still works while locked, it just saves the unchanged values,
  so a forgotten `unlockForm()` looks like a passing test.
- **The mapper's output is not what ships.** `useFormHandlers` strips the fields
  the change-inputs do not declare immediately before the mutation, so only the
  captured wire payload proves a field was saved. That is what
  `captureMutation()` is for.
- **The create form opens on Quick setup**, which exposes a subset of the
  controls; `switchToManualMode()` gets you the full form. It also restores a
  saved draft from localStorage, so `openBotCreator()` clears drafts through an
  init script — otherwise the second run of a spec starts from the first run's
  edits.
- **Buttons have off-canvas twins.** A responsive toolbar parks duplicate
  CREATE BOT / SAVE SETTINGS buttons at x ≈ -9790. They are not `display:none`
  and not zero-sized, so Playwright calls them visible; clicking one does
  nothing and the spec then dies on a response timeout that looks like a backend
  problem. The helpers select on the bounding box being inside the viewport.

## Rules for writing one

- **Seed through the API, assert through the UI.** Building a fixture by
  clicking tests the config screens, not the thing under test — and for some
  fixtures (an indicator in two roles, a short futures grid) it is most of an
  afternoon.
- **Delete everything you create, in teardown that runs on failure too.** Give
  each run a unique name prefix and sweep by name as well as by id, so a bot
  whose id was never recorded still gets cleaned up.
- **Never start a bot.**
