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

`bddgen` MUST run before tests (bundled into `npm test`). `.features-gen/` is gitignored — it won't exist on a fresh clone.

## Single BDD-only config (`playwright.bdd.config.ts`)

- `globalSetup: './src/config/global-setup.ts'` — creates `auth/github.json` on first run
- No `storageState` at config level — login tests run unauthenticated, issue-crud accesses public repo pages
- Generates from `features/` into `.features-gen/` (gitignored)
- Steps: `['steps/**/*.ts', 'src/fixtures/index.ts']`
- `fullyParallel: false` — tests run serially (data lifecycle depends on sequential order)
- `retries: process.env.CI ? 1 : 0` — up to 1 intra-run retry in CI, zero locally
- `workers: process.env.CI ? 2 : undefined`
- `timeout: 20_000` — 20s per test
- `forbidOnly: !!process.env.CI` — `.only` is blocked in CI to prevent accidentally skipping tests
- `outputDir: 'reports/artifacts'` — Playwright writes `.last-run.json` here (used by `--last-failed`)

## Project structure

```
features/   → .feature files (Gherkin scenarios)
steps/      → BDD step definitions (createBdd + Given/When/Then)
src/
  fixtures/ → custom test fixtures (github, project-data, project-api, pages)
  pages/    → POMs (core, panels, views, filters)
  utils/    → api/, testing/, auth/, reporting/, accessibility/, ai/
  config/   → global-setup.ts, setup/, env.config.ts
```

No `tests/` directory — everything is BDD.

## Fixtures (src/fixtures/)

| File                      | Extends          | Used by                           |
| ------------------------- | ---------------- | --------------------------------- |
| `github.fixture.ts`       | `playwright-bdd` | Login BDD steps (unauthenticated) |
| `project-data.fixture.ts` | `playwright-bdd` | Data lifecycle (all tests)        |
| `project-api.fixture.ts`  | `playwright-bdd` | API clients (authenticated)       |
| `pages.fixture.ts`        | `playwright-bdd` | POM injection (all steps)         |

`src/fixtures/index.ts` merges fixtures via `mergeTests` and attaches an auto-fixture for Allure labels.

## Auth setup (global-setup.ts)

`src/config/global-setup.ts` runs once before all tests:

1. Skips if `auth/github.json` exists
2. Launches headless Chromium, logs into GitHub
3. If device verification is triggered, connects to Gmail via IMAP (`imap` package), polls inbox up to 60s for the 6-digit code
4. Saves storage state

## Env vars

All env vars use the `GH_` prefix (not `GITHUB_`):

| Variable                    | Purpose                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `GH_USERNAME`               | GitHub test account                                                |
| `GH_PASSWORD`               | GitHub test password                                               |
| `GH_API_TOKEN`              | Personal access token                                              |
| `GH_TEST_REPO`              | Repo for test issues (e.g. `owner/repo`)                           |
| `GH_TEST_REPO_OWNER`        | Owner of test repo                                                 |
| `GH_TEST_REPO_NAME`         | Name of test repo (without owner/)                                 |
| `GH_PROJECT_SANDBOX`        | Persistent sandbox project name                                    |
| `GH_PROJECT_SANDBOX_NUMBER` | Sandbox project number (URL slug)                                  |
| `GMAIL_ADDRESS`             | Gmail for device verification                                      |
| `GMAIL_APP_PASSWORD`        | 16-char app password (not regular password)                        |
| `BASE_URL`                  | Defaults to `https://github.com`                                   |
| `TEST_MODE`                 | `read-only` (safe no-auth) or `full` (authenticated + write)       |
| `NODE_OPTIONS`              | Must be `--use-system-ca` in CI (HTTPS to GitHub fails without it) |


## DataManager — LIFO cleanup queue

`src/utils/testing/data-manager.ts`: fixtures enqueue cleanup callbacks that run in reverse order after the test (pass or fail). One failure doesn't block others. Logs `[seeder]` / `[cleanup]` to console.

## API clients

Both use Playwright's built-in `request` fixture (zero extra HTTP deps):

- `GitHubAPI` (`src/utils/api/github-rest.ts`) — REST
- `GitHubProjectsAPI` (`src/utils/api/github-graphql.ts`) — GraphQL (Projects V2)

## Locator conventions

Role-based only (no CSS selectors — GitHub hashes class names). Use `exact: true` when GitHub has duplicate `role`/`name` combos (e.g. two "Sign in" buttons).

## CI workflows (.github/workflows/)

| Workflow         | Trigger                        | Purpose                                                      |
| ---------------- | ------------------------------ | ------------------------------------------------------------ |
| `ci.yml`         | PR to main, push to main       | Typecheck, lint, format check, bddgen                        |
| `e2e-full.yml`   | Schedule (Sun 1AM UTC), manual | Full BDD suite (excludes @visual), Allure report to GH Pages |
| `e2e-debug.yml`  | Manual (with tag input)        | Filtered tests by Gherkin tag, configurable trace/video      |
| `e2e-visual.yml` | Manual                         | Visual regression (`@visual` tag only)                       |

### Rerun-failed-only (e2e-full.yml)

When you click "Re-run failed jobs" in GitHub on `e2e-full.yml`:

1. Auto-detects rerun via `github.run_attempt > 1`
2. Downloads previous attempt's test cache artifact (`.last-run.json` + Allure results)
3. Runs only previously failed tests via `--last-failed`
4. Allure report auto-merges (old results kept, failed ones overwritten)
5. Falls back to full suite if no cache found

## Gotchas

- TypeScript 5.x with strict mode enabled
- `closeIssue()` swallows errors (cleanup); `createIssue()` throws
- `imap` is an unusual devDependency — only used by global-setup for device verification codes
- `test.use()` at module level breaks BDD codegen — use it inside `Before` hooks or fixture definitions only
- `NODE_OPTIONS: --use-system-ca` is **required in CI** — HTTPS requests to GitHub fail without it
