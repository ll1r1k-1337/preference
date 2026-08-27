# Preference

![CI](https://github.com/ll1r1k-1337/preference/actions/workflows/ci.yml/badge.svg)

Preferans (Преферанс) — classic Russian trick-taking card game for three players.

## Project Description

A web-based implementation of the Preferans card game featuring:
- Full game engine with bidding, widow pickup, discard, whist declaration, and trick play
- Scoring system with pulya, gora, whists, penalties, raspasy, and mizer
- AI bot opponent with Monte-Carlo strategy
- Interactive UI built with Vue 3 and TypeScript

## Getting Started

```bash
npm install
npm run dev
```

## Development

- `npm run dev` — start development server
- `npm run build` — production build
- `npm run test` — run tests
- `npm run lint` — run linter
- `npm run typecheck` — type checking

## Release Process

This project uses [release-please](https://github.com/googleapis/release-please) for automated releases with semantic versioning.

### How It Works

1. Developers write commits using the [Conventional Commits](https://www.conventionalcommits.org/) format.
2. When commits are pushed/merged to `main`, the release-please GitHub Action runs automatically.
3. Release-please analyzes commits since the last release and opens a "Release PR" that:
   - Bumps the version in `package.json`
   - Updates `CHANGELOG.md` with all changes
4. When the Release PR is merged, release-please creates a GitHub Release with the new version tag.
5. Releases can also be triggered manually via the workflow_dispatch trigger in GitHub Actions.

### Commit Message Format

Use [Conventional Commits](https://www.conventionalcommits.org/) for all commit messages:

| Prefix | Version Bump | Example |
|--------|-------------|---------|
| `fix:` | Patch (0.0.x) | `fix: correct trick scoring logic` |
| `feat:` | Minor (0.x.0) | `feat: add mizer game mode` |
| `feat!:` or `BREAKING CHANGE:` | Major (x.0.0) | `feat!: redesign scoring API` |
| `chore:` | No release | `chore: update dependencies` |
| `docs:` | No release | `docs: update README` |
| `ci:` | No release | `ci: add lint step` |
| `refactor:` | No release | `refactor: simplify deal phase` |
| `test:` | No release | `test: add bidding edge cases` |

### Examples

```bash
# Bug fix → patch release
git commit -m "fix: handle edge case in widow pickup"

# New feature → minor release
git commit -m "feat: add game replay functionality"

# Breaking change → major release
git commit -m "feat!: change scoring API return type"

# With scope
git commit -m "fix(engine): correct trump suit validation"

# Multi-line with body
git commit -m "feat: add save/load game state

Implements localStorage persistence for game state.
Players can resume interrupted games."
```

### Manual Release

You can trigger a release manually from the GitHub Actions tab:
1. Go to Actions → Release workflow
2. Click "Run workflow"
3. Select the `main` branch
4. Click "Run workflow"

## License

[MIT](LICENSE)
