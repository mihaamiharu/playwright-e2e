# AGENTS.md

## Commands

```
npm test                        # all non-BDD tests
npm test -- --headed            # headed
npm test -- tests/path/to/spec.ts   # single test
npm test -- --grep @smoke       # smoke-tagged only
npm run test:bdd                # BDD: codegen + run (separate config)
npm run test:ui                 # Playwright UI mode
npm run lint / lint:fix         # ESLint on src/ tests/ steps/
npm run format / format:check   # Prettier
npm run typecheck               # tsc --noEmit
npm run report                  # HTML report
npm run report:allure           # Allure report
npm run bddgen                  # .feature → .spec.ts only, no run
```

## Two separate test configs

- **`playwright.config.ts`** — `testDir: './tests'`, uses `storageState: 'auth/github.json'`, runs `globalSetup` for auth
- **`playwright.bdd.config.ts`** — BDD only, no `storageState`, no `globalSetup`, generates from `features/` into `.features-gen/`

BDD config includes `src/fixtures/github.fixture.ts` in the `steps` array — this is a playwright-bdd convention to wire fixtures into Gherkin, not a mistake.

## Fixtures (src/fixtures/)

Three fixture files, layered:

| File | Extends | Used by |
|---|---|---|
| `github.fixture.ts` | `playwright-bdd` | BDD login steps |
| `data-lifecycle.fixture.ts` | `@playwright/test` | REST-only tests |
| `github-project.fixture.ts` | `playwright-bdd` | Project management tests |

`github-project.fixture.ts` extends `playwright-bdd` but is imported by pure Playwright tests (`tests/e2e/github/issue-crud.spec.ts`). This works because `playwright-bdd` is a superset of `@playwright/test`.

## Auth setup (global-setup.ts)

`src/config/global-setup.ts` runs once before all non-BDD tests:

1. Skips if `auth/github.json` exists
2. Launches headless Chromium, logs into GitHub
3. If device verification is triggered, connects to Gmail via IMAP (`imap` package), polls inbox up to 60s for the 6-digit code
4. Saves storage state

**Required env vars for auth:** `GITHUB_USERNAME`, `GITHUB_PASSWORD`, `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD` (16-char, not regular password)

## DataManager — LIFO cleanup queue

`src/utils/data-manager.ts`: fixtures enqueue cleanup callbacks that run in reverse order after the test (pass or fail). One failure doesn't block others. Example pattern in `seededProjectIssue` fixture: create issue → add to project → enqueue (remove from project, close issue).

## API clients

Both use Playwright's built-in `request` fixture (zero extra HTTP deps):
- `GitHubAPI` (`src/utils/api-client.ts`) — REST
- `GitHubProjectsAPI` (`src/utils/github-projects-api.ts`) — GraphQL (Projects V2)

## Locator conventions

Role-based only (no CSS selectors — GitHub hashes class names):
1. `getByRole()` — preferred
2. `getByLabel()` / `getByPlaceholder()`
3. `getByText()`
4. `getByTestId()` — not usable on GitHub

## Path aliases (tsconfig.json)

`@pages/*` → `src/pages/*`, `@fixtures/*` → `src/fixtures/*`, `@utils/*` → `src/utils/*`, `@data/*` → `src/data/*`, `@config/*` → `src/config/*`

## CI

No CI workflows exist yet (no `.github/` directory). The configs check `process.env.CI` for retries/workers, but nothing triggers them.

## Gotchas

- TypeScript 6.0 with `ignoreDeprecations: "6.0"` — bleeding edge
- `closeIssue()` swallows errors (cleanup); `createIssue()` throws
- No `BasePage` class implemented yet despite architecture doc mentioning it
- `imap` is an unusual devDependency — only used by global-setup for device verification codes
