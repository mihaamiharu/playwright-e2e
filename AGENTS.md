# AGENTS.md

## Commands

All tests are BDD (Gherkin `.feature` files via playwright-bdd). The sole config is `playwright.bdd.config.ts`.

```
npm test                        # bddgen + run all BDD tests
npm test -- --headed            # headed
npm test -- --grep @smoke       # run tests matching tag
npm test -- --grep @P0          # priority-tagged only
npm run test:smoke              # shortcut for @smoke
npm run test:ui                 # Playwright UI mode
npm run lint / lint:fix         # ESLint on src/ steps/
npm run format / format:check   # Prettier
npm run typecheck               # tsc --noEmit
npm run report                  # HTML report
npm run report:allure           # Allure report
npm run bddgen                  # .feature → .spec.ts only, no run
```

## Single BDD-only config (`playwright.bdd.config.ts`)

- `globalSetup: './src/config/global-setup.ts'` — creates `auth/github.json` on first run
- No `storageState` at config level — login tests run unauthenticated, issue-crud accesses public repo pages
- Generates from `features/` into `.features-gen/` (gitignored)
- Steps: `['steps/**/*.ts', 'src/fixtures/github.fixture.ts', 'src/fixtures/github-project.fixture.ts']`

`bddgen` MUST run before tests (bundled into `npm test`). `.features-gen/` is gitignored — it won't exist on a fresh clone.

## Project structure

```
features/   → .feature files (Gherkin scenarios)
steps/      → BDD step definitions (createBdd + Given/When/Then)
src/
  fixtures/ → custom test fixtures (playwright-bdd base)
  pages/    → POMs
  utils/    → DataManager, REST client, GraphQL client
  config/   → global-setup.ts, env.config.ts
```

No `tests/` directory — everything is BDD.

## Fixtures (src/fixtures/)

| File                        | Extends            | Used by                           |
| --------------------------- | ------------------ | --------------------------------- |
| `github.fixture.ts`         | `playwright-bdd`   | Login BDD steps (unauthenticated) |
| `data-lifecycle.fixture.ts` | `@playwright/test` | REST-only tests                   |
| `github-project.fixture.ts` | `playwright-bdd`   | Project management BDD steps      |

## Auth setup (global-setup.ts)

`src/config/global-setup.ts` runs once before all tests:

1. Skips if `auth/github.json` exists
2. Launches headless Chromium, logs into GitHub
3. If device verification is triggered, connects to Gmail via IMAP (`imap` package), polls inbox up to 60s for the 6-digit code
4. Saves storage state

**Required env vars for auth:** `GITHUB_USERNAME`, `GITHUB_PASSWORD`, `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD` (16-char, not regular password)

## DataManager — LIFO cleanup queue

`src/utils/data-manager.ts`: fixtures enqueue cleanup callbacks that run in reverse order after the test (pass or fail). One failure doesn't block others. Logs `[seeder]` / `[cleanup]` to console.

## API clients

Both use Playwright's built-in `request` fixture (zero extra HTTP deps):

- `GitHubAPI` (`src/utils/api-client.ts`) — REST
- `GitHubProjectsAPI` (`src/utils/github-projects-api.ts`) — GraphQL (Projects V2)

## Locator conventions

Role-based only (no CSS selectors — GitHub hashes class names). Use `exact: true` when GitHub has duplicate `role`/`name` combos (e.g. two "Sign in" buttons).

## CI

No CI workflows exist yet (no `.github/` directory). Config checks `process.env.CI` for retries/workers.

## Gotchas

- TypeScript 6.0 with `ignoreDeprecations: "6.0"` — bleeding edge
- `closeIssue()` swallows errors (cleanup); `createIssue()` throws
- No `BasePage` class implemented yet despite architecture doc mentioning it
- `imap` is an unusual devDependency — only used by global-setup for device verification codes
- `test.use()` at module level breaks BDD codegen — use it inside `Before` hooks or fixture definitions only
