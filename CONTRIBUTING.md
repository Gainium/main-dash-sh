# Contributing to Gainium Self-Hosted Dashboard

Thanks for your interest in contributing! This guide covers what you need
to know before opening a pull request.

## Contributor License Agreement (CLA)

This project is licensed under the **Fair Core License 1.0
(FCL-1.0-Apache-2.0)** (see [`LICENSE`](./LICENSE)). Before your first
contribution can be merged, you must sign our Contributor License
Agreement.

The process is automated by a GitHub Action:

1. Open your pull request.
2. The CLA bot will comment on the PR with a link to [`CLA.md`](./CLA.md).
3. Read the CLA. If you agree, post the exact sentence the bot tells you
   in a PR comment:

   > `I have read the CLA Document and I hereby sign the CLA`

4. The bot records your signature and the PR is unblocked. You only need
   to sign once — future PRs from the same GitHub account are auto-cleared.

## Development setup

```bash
git clone https://github.com/Gainium/main-dash-sh.git
cd main-dash-sh
npm install        # also runs `patch-package` postinstall
npm run dev        # starts Vite on the default port
```

Point `VITE_API_ENDPOINT` and `VITE_WS_URL` (or copy `.env.example` to
`.env.development`) at your local `app-sh` backend.

## Pull requests

- Open the PR against `main`.
- Keep the diff small and focused — one PR per logical change.
- If the change is user-visible, add an entry under [`.changes/`](./.changes/README.md).
  Don't edit the `version` in `package.json` or add a release section to
  `CHANGELOG.md`: both are assigned when the change is released.
- Run `npm run type-check` and `npm run lint` locally before pushing.
- CI must be green before review.

## Reporting bugs / security issues

For non-sensitive bug reports, open an issue. For security-sensitive
reports, email **security@gainium.io** rather than filing a public issue.
