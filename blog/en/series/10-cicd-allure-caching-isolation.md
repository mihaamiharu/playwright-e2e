# CI/CD for the Paranoid QA: Sandbox Isolation, Allure Caching, and the Ephemeral Auth Trap

> **Part 10 of the Playwright E2E series.**
> [Part 1](/blog/01-why-real-websites.md) — Why real websites beat demo apps
> [Part 2](/architecture-tour) — Architecture of a production-grade E2E suite
> [Part 3](/fixtures-over-basetest) — Why fixtures over BaseTest
> [Part 4](/blog/04-authentication-without-2fa.md) — Authentication without the 2FA nightmare
> [Part 5](/blog/05-building-label-tests-with-ui-discovery.md) — Building E2E label tests with UI discovery
> [Part 6](/blog/06-assignees-milestones.md) — Assignees & Milestones: The Sidebar Pattern Pays Off
> [Part 7](/blog/07-real-world-e2e-gotchas.md) — 4 real-world E2E gotchas from GitHub Projects
> [Part 8](/blog/08-graphql-schema-archaeology.md) — GraphQL Schema Archaeology: Finding the Right Mutation
> [Part 9](/blog/09-scaling-playwright-cli-discovery.md) — From Single Click to Full Workflow: Scaling playwright-cli

---

## The premise: 37 Gherkin scenarios, zero CI experience, one deadline

After six months of building a production-grade Playwright + BDD test suite against real GitHub Projects, we had everything a QA team dreams of:

| Capability                                                             | Status |
| ---------------------------------------------------------------------- | ------ |
| 37 Gherkin scenarios covering the full project management lifecycle    | Done   |
| REST + GraphQL API clients for seed/cleanup                            | Done   |
| Persistent sandbox project, parallel-safe unique names                 | Done   |
| `@P0` / `@P1` / `@P2` priority tagging, `@smoke` / `@noauth` filtering | Done   |
| Local `npm test` with HTML + Allure + terminal reporters               | Done   |

What we didn't have was a single line of CI/CD. No `workflow_dispatch`. No `cron`. No `--grep @smoke` in the cloud. The entire test plan lived on one developer's laptop.

Phase 6 was about fixing that — and it turned out to be the most architecturally demanding phase of the entire project. Not because GitHub Actions is hard. Because authenticating against a real third-party service in an ephemeral container forces you to confront questions that tutorial CI pipelines never address:

- How do you handle device verification (IMAP 2FA polling) when every CI runner is a "new device"?
- How do you run PR checks that prove the code compiles and the tests are syntactically valid — without exposing production credentials?
- What happens when fixture composition silently contaminates one test's browser context with another test's cookies?
- Why do Gherkin `@P0` / `@P1` tags vanish from the Allure dashboard even though playwright-bdd generates them correctly?
- How do you make test trend graphs work when every CI run starts from a blank slate?

This post walks through all five problems and the solutions we shipped.

---

## Problem 1: The ephemeral container authentication dilemma

### The setup

Our test suite authenticates against GitHub through `src/config/global-setup.ts`. The flow:

1. Check if `auth/github.json` exists. If yes, skip.
2. Launch headless Chromium, fill in `GITHUB_USERNAME` and `GITHUB_PASSWORD`.
3. Click "Sign in."
4. If redirected to `/sessions/verified-device`: connect to Gmail via IMAP (`imap` package), poll inbox for a 6-digit verification code from `noreply@github.com`, enter it.
5. Save `storageState` to `auth/github.json`.

Locally, this works beautifully. Step 1 fires on every `npm test` — "Auth state found — skipping login" — and the browser launches in milliseconds.

In CI, step 1 **never** fires. GitHub Actions' ephemeral runners start clean every time. `auth/github.json` is gitignored. Every CI run is a "first run."

### The four approaches

We evaluated four strategies for handling auth in CI:

| Approach                             | Mechanism                                                                                               | Pros                                 | Cons                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **A: Pre-generate as secret**        | Base64-encode `auth/github.json`, store as `AUTH_STATE` secret, decode on CI                            | No IMAP polling, fast                | Session cookies expire in ~2 weeks. Manual refresh required. If you forget, the pipeline silently breaks.  |
| **B: Full login every run**          | Provide all 5 auth vars (username, password, gmail, app password, token), let global-setup do its thing | Zero maintenance, always fresh auth  | 30–60s IMAP polling per run. GitHub may flag repeated device-verification triggers as suspicious activity. |
| **C: `actions/cache` the auth file** | Cache `auth/github.json` with 7-day TTL, fall back to full login on cache miss                          | Semi-automated, fast after first run | Same session-expiry problem. Cache misses = full login.                                                    |
| **D: Cache with fallback**           | Combine C and B — try cache first, full login as fallback                                               | Best of both worlds                  | More YAML complexity.                                                                                      |

**Our choice: Option B for the weekly full suite, and a separate no-secrets PR workflow for quality gates.**

The reasoning: this is a weekly scheduled run. 30–60 seconds of IMAP polling once a week is negligible. And we didn't want a cache-miss auth failure taking down the entire pipeline six months from now because nobody remembered to refresh the token.

```yaml
# .github/workflows/e2e-full.yml
- name: Run Playwright tests
  env:
    GITHUB_USERNAME: ${{ secrets.GITHUB_USERNAME }}
    GITHUB_PASSWORD: ${{ secrets.GITHUB_PASSWORD }}
    GMAIL_ADDRESS: ${{ secrets.GMAIL_ADDRESS }}
    GMAIL_APP_PASSWORD: ${{ secrets.GMAIL_APP_PASSWORD }}
    GITHUB_API_TOKEN: ${{ secrets.GITHUB_API_TOKEN }}
    # ... all other sandbox vars ...
    TEST_MODE: full
  run: npm test
```

### The architectural insight

The right question isn't "which auth approach is fastest?" It's "**which workflows need auth at all?**" Once you ask that, the answer becomes clear: you need **at least two** workflows.

| Workflow        | Triggers            | Secrets?    | Purpose                                 |
| --------------- | ------------------- | ----------- | --------------------------------------- |
| `ci.yml`        | PR, push to main    | **None**    | Typecheck, lint, format, bddgen         |
| `e2e-full.yml`  | Weekly cron, manual | All secrets | Full 37-scenario suite                  |
| `e2e-debug.yml` | Manual, tag input   | All secrets | Targeted investigation with full traces |

The split means PR checks complete in under 2 minutes with zero secrets exposed. The weekly full suite does the heavy auth lifting.

---

## Problem 2: PR safety gates via conditional fixtures

### The setup

We wanted `ci.yml` to prove that BDD features compile correctly without syntax errors. That required:

```
npm run bddgen     # generate .spec.ts from .feature
npm run typecheck   # verify TypeScript
npm run lint        # verify ESLint
npm run format:check # verify Prettier
```

But `npm run bddgen` alone doesn't run tests. The moment we add `npx playwright test`, every sandbox-dependent test tries to access `GITHUB_API_TOKEN` and `GITHUB_TEST_REPO` — and fails because those aren't set in the PR workflow.

Adding `--grep @noauth` wasn't enough. The project fixtures (`github-project.fixture.ts`) call `requireSandbox()` in every fixture factory:

```typescript
function requireSandbox() {
  if (!env.hasSandboxProject) {
    throw new Error(
      'Project fixtures require GITHUB_API_TOKEN, GITHUB_TEST_REPO, ' +
        'and GITHUB_PROJECT_SANDBOX in .env',
    );
  }
}
```

Even if a test doesn't _use_ the sandbox, importing the merged fixture (`src/fixtures/index.ts`) triggers the error.

### The solution: `TEST_MODE=read-only`

We already had a `TEST_MODE` env var defined in `env.config.ts` but it was a dead variable — defined, never wired into any logic. We fixed that with a single guard:

```typescript
function requireSandbox() {
  if (env.testMode === 'read-only') {
    test.skip(true, 'Skipping sandbox-dependent test in read-only mode');
  }
  if (!env.hasSandboxProject) {
    throw new Error(/* ... */);
  }
}
```

This is the kind of fix that looks obvious in hindsight but requires architectural thinking upfront. The `requireSandbox()` function is called by every project fixture (`githubAPI`, `projectsAPI`, `sandbox`, `seededProjectIssue`). One guard gates them all. No per-test tag lists. No brittle `--grep` filters. No maintenance burden as you add new features.

```yaml
# CI: read-only — runs negative login tests, skips everything else
TEST_MODE: read-only

# Full suite: authenticated — runs all 37 scenarios
TEST_MODE: full
```

### The PR workflow

The `ci.yml` workflow is intentionally minimal — no browser tests at all:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with: { node-version: lts/*, cache: 'npm' }
  - run: npm ci
  - run: npm run typecheck
  - run: npm run lint
  - run: npm run format:check
  - run: npx playwright install --with-deps chromium
  - run: npm run bddgen
```

Six steps, zero secrets, completes in under 2 minutes. It proves that every `.feature` file parses, every step definition resolves, every TypeScript type checks, and the codebase is formatted. That's the right set of guarantees for a PR build.

---

## Problem 3: When fixtures contaminate contexts

### The setup

We had two fixture files merged into one:

```typescript
// src/fixtures/index.ts
export const test = mergeTests(githubTest, projectTest);
```

`github.fixture.ts` provides `anonymousPage` (fresh, no cookies) and `loginPage`. `github-project.fixture.ts` provides `githubAPI`, `projectsAPI`, `sandbox`, `seededProjectIssue` — and overrides the `page` fixture to inject auth cookies:

```typescript
page: async ({ page }, use) => {
  await ensureAuthCookies(page.context());
  await use(page);
},
```

The `loginPage` fixture in `github.fixture.ts` was built on the `page` fixture:

```typescript
loginPage: async ({ page }, use) => {
  const loginPage = new LoginPage(page);
  await use(loginPage);
},
```

Since `page` now had auth cookies loaded (from `github-project.fixture.ts`), every test using `loginPage` was starting with an **authenticated** context. When a negative login test navigated to `https://github.com/login`, GitHub saw the valid session cookie and immediately redirected to the dashboard.

Result: `getByLabel('Username or email address')` never appeared on the page. The login test failed before it could even type a password.

### The fix, part 1: Isolate the anonymous context

The `anonymousPage` fixture was just a passthrough alias:

```typescript
anonymousPage: async ({ page }, use) => {
  await use(page); // same page with auth cookies — not anonymous!
},
```

We replaced it with a truly isolated context using `browser.newContext()`:

```typescript
anonymousPage: async ({ browser }, use) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await use(page);
  await context.close();
},
```

This creates a fresh browser context with zero cookies, zero localStorage, zero session state. When `loginPage` now constructs itself from `anonymousPage`:

```typescript
loginPage: async ({ anonymousPage }, use) => {
  const loginPage = new LoginPage(anonymousPage);
  await use(loginPage);
},
```

### The fix, part 2: Assert on the right page

This exposed a second bug. The negative login step definitions used Playwright's default `{ page }` fixture in their assertions:

```typescript
// ❌ Asserts on the authenticated page, which stayed on about:blank
Then('the form should not submit', async ({ page }) => {
  await expect(page).toHaveURL(/login/);
});
```

But `{ page }` was the authenticated page that was never navigated to `/login`. The `loginPage` was on `anonymousPage` — a completely different `Page` object. The assertion was checking the wrong page.

The fix: assert on `loginPage.page` (the isolated page where the form interaction actually happened):

```typescript
// ✅ Asserts on the isolated anonymous page where the form is
Then('the form should not submit', async ({ loginPage }) => {
  await expect(loginPage.page).toHaveURL(/login/);
});
```

This same pattern applied to the positive login steps as well:

```typescript
Then('I should be redirected to the dashboard', async ({ loginPage }) => {
  const page = loginPage.page;
  await expect(page).toHaveURL(/github\.com/);
  // ... 2FA / dashboard detection ...
});
```

### The principle

**Fixture composition is not associative.** When `mergeTests(githubTest, projectTest)` overrides the `page` fixture, every downstream fixture that depends on `page` inherits the override — silently. The compiler won't catch it. The linter won't warn. Only a test that actually asserts on the page's authentication state will reveal the contamination.

**Rule:** if a fixture is named `anonymousPage`, it must be provably anonymous. Passthrough aliases to authenticated fixtures betray the name and the intent. Use `browser.newContext()` for true isolation.

---

## Problem 4: Converting Gherkin tags to Allure metadata

### The setup

When you write a `.feature` file with priority tags:

```gherkin
@P0 @smoke
Scenario: Login with valid credentials

@P1 @noauth
Scenario: Login fails with wrong password
```

playwright-bdd compiles these into native Playwright tags:

```javascript
test('Login fails with wrong password', { tag: ['@github', '@authentication', '@P1', '@noauth'] }, async ({ ... }) => { ... });
```

Allure's Playwright integration automatically picks up these tags and attaches them as `label` entries in the Allure results JSON:

```json
[
  { "name": "tag", "value": "github" },
  { "name": "tag", "value": "authentication" },
  { "name": "tag", "value": "P1" },
  { "name": "tag", "value": "noauth" }
]
```

But here's the gap: they're all filed under `"name": "tag"`. A `@P0` test and a `@noauth` test look identical in the Allure tag cloud. There's no way to filter the Allure dashboard by priority, no severity pie chart, no way to assert "all blocker-severity tests must pass before release."

### The fix: an auto-fixture that maps tags to Allure severity

Allure has a structured severity model: `blocker`, `critical`, `normal`, `minor`, `trivial`. We built a mapping:

```typescript
// src/utils/allure-labels.ts
import { allure } from 'allure-playwright';

const SEVERITY_MAP: Record<string, 'blocker' | 'normal' | 'minor'> = {
  P0: 'blocker',
  P1: 'normal',
  P2: 'minor',
};

export async function attachAllureLabels(tags: string[]): Promise<void> {
  if (!tags || tags.length === 0) return;

  for (const tag of tags) {
    const cleanTag = tag.startsWith('@') ? tag.slice(1) : tag;
    const upper = cleanTag.toUpperCase();

    if (upper in SEVERITY_MAP) {
      await allure.severity(SEVERITY_MAP[upper]);
    }
  }
}
```

Then we wired it into every test via an **auto-fixture**:

```typescript
// src/fixtures/index.ts
export const test = mergeTests(githubTest, projectTest).extend<{ _allureLabels: void }>({
  _allureLabels: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, testInfo) => {
      await attachAllureLabels(testInfo.tags);
      await use();
    },
    { auto: true },
  ],
});
```

The `{ auto: true }` option means this fixture runs before every single test — zero code changes needed in any step definition or feature file.

### The result

The generated Allure JSON now includes a structured severity label:

```json
[
  { "name": "tag", "value": "github" },
  { "name": "tag", "value": "authentication" },
  { "name": "tag", "value": "P1" },
  { "name": "severity", "value": "normal" },
  { "name": "tag", "value": "noauth" }
]
```

The `P1` tag is still present as a general tag (for searchability), but it now has a companion `severity: normal` label that Allure's dashboard renders as a filterable, color-coded severity indicator.

### The API archaeology that made this work

This feature required understanding how `playwright-bdd` passes tags to Playwright. Earlier versions of playwright-bdd embedded tags in the test title string (`"Login fails with wrong password @P1 @noauth"`), and we initially wrote a regex parser to extract them.

But playwright-bdd v8 passes tags through Playwright's native `testInfo.tags` array. The wrong approach (regex title parsing) would have silently stopped working if someone renamed a scenario. The right approach (`testInfo.tags`) is resilient to title changes and uses the framework's own API.

**Lesson:** before writing a parser, check if the framework already surfaces the data in a structured form.

---

## Problem 5: Unlocking historical trend graphs in ephemeral CI

### The setup

Every GitHub Actions run starts from a blank slate. The `allure-results/` directory is populated during `npm test`. The `npx allure generate` step converts those results into a static HTML report.

But there's a catch: Allure trend graphs require a `history/` directory containing aggregated data from previous runs. Without it, every report is a one-off snapshot:

| Without history                  | With history                                      |
| -------------------------------- | ------------------------------------------------- |
| ✅ Pass/fail counts for this run | ✅ Pass/fail trend over last 20 runs              |
| ✅ Individual test results       | ✅ Flaky test detection                           |
| ❌ No trend data                 | ✅ Duration trends (is the suite getting slower?) |
| ❌ No historical pass rate       | ✅ Go/no-go dashboards                            |

### The fix: a 5-step cache cycle

We embedded Allure history caching directly into `e2e-full.yml`:

```
npm test
  │ (produces reports/allure/results/*.json)
  ▼
Step 1: Restore history from cache
  │ actions/cache/restore → reports/allure/history/
  ▼
Step 2: Inject history into results
  │ cp -r reports/allure/history/* reports/allure/results/history/
  ▼
Step 3: Generate report with history
  │ npx allure generate reports/allure/results -o reports/allure/report
  │ (combines new results with historical data)
  ▼
Step 4: Extract updated history
  │ cp -r reports/allure/report/history/* reports/allure/history/
  ▼
Step 5: Save history back to cache
  │ actions/cache/save → key: allure-history-{branch}-{run}
```

The cache key uses `${{ github.ref_name }}` and `${{ github.run_id }}` to scope history per-branch while still allowing restore from the same branch's previous runs:

```yaml
- name: Restore Allure History Cache
  uses: actions/cache/restore@v4
  with:
    path: reports/allure/history
    key: allure-history-${{ github.ref_name }}-${{ github.run_id }}
    restore-keys: |
      allure-history-${{ github.ref_name }}-
      allure-history-
```

The `restore-keys` fallback means: try to match the exact run ID first (unlikely to hit), then fall back to the most recent run from the same branch, then fall back to _any_ branch's history. This guarantees trend continuity even when the exact cache key misses.

### Why this matters for QA

Without history, you can't answer the question every engineering manager asks on release day: "**Are the tests getting better or worse?**" A single-pass/fail snapshot tells you what broke. Trend data tells you whether the suite is decaying.

With history enabled, Allure's dashboard shows you:

- **Duration trends**: Is TBL-01 consistently 2 seconds slower than last month?
- **Flaky tests**: Which tests pass 80% of the time and fail 20%?
- **Pass rate over time**: Did the last 5 runs all pass, or is there a new regression?

---

## Consolidation: one `reports/` directory to rule them all

Before Phase 6, the project had four report directories scattered across the workspace root:

```
playwright-report/     ← HTML reporter output
allure-results/       ← raw Allure JSON
allure-report/        ← generated Allure HTML
test-results/         ← traces, screenshots, videos
```

Every developer had to remember which directory served which purpose. The `.gitignore` had five separate entries for report artifacts. The `package.json` scripts referenced paths in inconsistent ways.

We consolidated everything under a single `reports/` directory:

```
reports/
  playwright/          ← HTML report
  allure/
    results/           ← raw JSON
    report/            ← generated HTML
    history/           ← CI trend data (cached)
  artifacts/           ← traces, videos, screenshots
```

The `.gitignore` collapsed to a single line: `reports/`.

The npm scripts were updated accordingly:

```json
{
  "report": "npx playwright show-report reports/playwright",
  "report:allure": "npx allure generate reports/allure/results --clean -o reports/allure/report && npx allure open reports/allure/report"
}
```

The Playwright config now routes everything through `reports/`:

```typescript
outputDir: 'reports/artifacts',
reporter: [
  ['html', { outputFolder: 'reports/playwright' }],
  ['allure-playwright', { resultsDir: 'reports/allure/results' }],
  ['line'],
],
```

### The `resultsDir` vs `outputFolder` trap

This is worth calling out because it cost us 20 minutes of debugging. When we first moved the `allure-playwright` reporter path, we used `outputFolder` — the same option name used by the HTML reporter. It failed silently. The Allure results kept landing in the old directory.

The correct option for `allure-playwright` v3 is `resultsDir`, not `outputFolder`. This option name comes from `allure-js-commons`'s `ReporterConfig` interface, which extends into `allure-playwright`'s config. The HTML reporter's `outputFolder` is a Playwright-native option, but `allure-playwright` wraps the Allure SDK directly.

**Rule:** when configuring reporters that wrap third-party SDKs, check the reporter's own type definitions, not the Playwright docs. The option name may differ from what other reporters use.

---

## The debug workflow: on-demand forensic investigation

We added a third workflow, `e2e-debug.yml`, for the scenario where a specific test is failing and you need full forensic data:

```yaml
on:
  workflow_dispatch:
    inputs:
      tag:
        description: 'Gherkin tag to filter tests (e.g. @P0, @smoke, @noauth)'
        required: true
        type: string
        default: '@P0'
      trace:
        description: 'Trace capture mode'
        required: true
        type: choice
        options: [on, retain-on-failure]
        default: on
      video:
        description: 'Video capture mode'
        required: true
        type: choice
        options: [on, retain-on-failure, off]
        default: retain-on-failure
```

Three differences from the weekly full suite:

| Aspect            | `e2e-full.yml`      | `e2e-debug.yml`                              |
| ----------------- | ------------------- | -------------------------------------------- |
| Trigger           | cron + manual       | manual only                                  |
| Filter            | all 37 tests        | tag input                                    |
| Trace default     | `retain-on-failure` | `on` (full trace always)                     |
| Artifacts on pass | html + allure only  | html + allure + test-results (traces/videos) |
| Quality gates     | yes                 | **no** (skipped for speed)                   |

The `--trace on --video on` flags override the Playwright config at runtime — no config changes needed. This means a QA engineer can trigger a run against `@P0` with full traces, download the `test-results-debug` artifact 5 minutes later, and open the Playwright trace viewer to step through the DOM state at every interaction.

---

## The complete workflow matrix

| Workflow   | File            | Trigger             | Secrets        | Tests run               | Artifacts                                                         |
| ---------- | --------------- | ------------------- | -------------- | ----------------------- | ----------------------------------------------------------------- |
| CI         | `ci.yml`        | PR, push to main    | None           | 0 (quality gates only)  | None                                                              |
| Full Suite | `e2e-full.yml`  | Weekly cron, manual | All 10 secrets | All 37 scenarios        | 3 artifacts (html report, allure report, test-results on failure) |
| Debug      | `e2e-debug.yml` | Manual, tag input   | All 10 secrets | Filtered by Gherkin tag | 3 artifacts always (including traces/videos on pass)              |

Each workflow serves a distinct audience: developers (CI), QA leads (full suite), and investigators (debug).

---

## Key takeaways

| Lesson                                                                        | Why it matters                                                                                                                                                                                          |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Split PR gates from full suites**                                           | Your PR pipeline should never see a production credential. Quality gates (typecheck, lint, bddgen) catch 90% of issues without touching a browser. Full suites with auth run on schedule or on demand.  |
| **Wire `TEST_MODE` into fixtures, not into tests**                            | A single `test.skip()` guard at the fixture level gates every sandbox-dependent test. No per-test `@noauth` annotations needed. No maintenance as you add scenarios.                                    |
| **`page` is not anonymous just because you named it `anonymousPage`**         | When `mergeTests` overrides the `page` fixture, every downstream fixture inherits the override. Use `browser.newContext()` for true isolation. Assert on the correct `Page` object in step definitions. |
| **Use `testInfo.tags`, not regex on `testInfo.title`**                        | playwright-bdd v8 passes Gherkin tags through Playwright's native `testInfo.tags` API. Regex title parsing is fragile and breaks when test names change.                                                |
| **A 5-step cache cycle unlocks historical trend graphs**                      | Restore → inject → generate → extract → save. Allure history turns one-off snapshots into trend dashboards that answer "are the tests getting better or worse?"                                         |
| **Check reporter option names against the SDK, not the Playwright docs**      | `allure-playwright` uses `resultsDir` (from `allure-js-commons`), not `outputFolder` (which is a Playwright-native option). Wrong option = silent fallback to default directory.                        |
| **Consolidate report directories early**                                      | A single `reports/` directory with a single `.gitignore` entry is easier to reason about, easier to clean, and easier to pass between CI steps than four scattered directories.                         |
| **Add a debug workflow with `trace: on` and `if: always()` artifact uploads** | When a test fails intermittently, you need the trace from the failure itself, not from the retry. A dedicated debug workflow with unconditional artifact uploads gives you that data on every run.      |

---

Phase 6 closed the loop: a local test suite that was provably correct on one developer's machine is now provably correct in the cloud — on schedule, on PR, and on demand. The 37-scenario test plan runs headless every week with full auth, full history, and full forensic data on failure.

The patterns here — conditional fixture gating, context isolation, structured label mapping, and cache-cycle history — aren't specific to GitHub or Playwright. They're architectural patterns that apply to any E2E test suite that needs to graduate from a developer's laptop to a CI pipeline without compromising security, speed, or observability.

_Next up: visual regression tests and accessibility checks._
