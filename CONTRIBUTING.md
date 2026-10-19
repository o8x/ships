# Contributing to Ships

Thanks for your interest in improving Ships! This is a small macOS menu bar app
built with Electron + Tailwind CSS. Contributions of all kinds are welcome —
bug reports, feature ideas, docs and code.

## Requirements

- macOS (the app targets macOS; other platforms are not supported yet)
- Node.js 22+
- [pnpm](https://pnpm.io) 10 (`npm` and `yarn` are not used)
- `python3` on `PATH` (the terminal feature uses a small PTY bridge script)

## Development

```bash
pnpm install        # install dependencies (postinstall builds the CSS)
pnpm start          # build CSS and launch the app
pnpm run dev        # launch without rebuilding the CSS
pnpm run watch:css  # rebuild the Tailwind output on change
```

Packaging (macOS arm64 PKG installer; postinstall launches the app):

```bash
pnpm dist:mac
```

## Before opening a pull request

- Keep changes focused; describe the "why" in the PR.
- Run `node --check` on any JavaScript you touch.
- Update `docs/PRD.md` alongside any behaviour change — it is the single source
  of truth for how the app behaves.
- Match the existing code style (no bundler; plain ES modules in the renderer,
  CommonJS in the main process; Tailwind for styles; no inline SVG in code).

## Commit messages

Commits are written in English with a `feat` / `fix` / `chore` prefix:

```
feat: add terminal line numbers
fix: keep the tray panel on top across spaces
chore: bump electron to 33
```

Version bumps use the fixed message `Bump vX.Y.Z`.

## Release

Maintainers update the version (semantic versioning), commit it as
`Bump vX.Y.Z`, tag it `vX.Y.Z`, and push. The macOS build workflow publishes the
PKG installer to the GitHub release for that tag.
