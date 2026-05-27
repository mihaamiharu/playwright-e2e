# CI/CD for QA Engineers: A Decision Framework, Not a YAML Tutorial

What to run, when, for whom, and why. A QA-centric guide to building a CI pipeline that doesn't leak credentials, doesn't block developers, and gives every stakeholder the report they actually need.

---

## The problem with most CI/CD tutorials

Search "Playwright CI GitHub Actions" and you'll find 50 articles that show you how to write a workflow file. They're all the same: `on: push`, `npx playwright test`, upload `playwright-report/`, done.

They skip the hard questions:

- What happens when your tests need a real login against a third-party service?
- How do you prove the test code compiles without exposing production credentials on every PR?
- Who needs what report — the developer debugging a flaky test, the QA lead tracking trends, or the release manager making a go/no-go decision?
- How do you investigate a CI failure without cloning the repo and running locally?

This guide answers those questions. It's not a YAML reference. It's a decision framework.

---

## The test matrix: what runs, when, for whom

Every test in your suite serves a stakeholder. The CI pipeline should reflect that.

| Trigger         | Audience    | Question they need answered           | What runs                                            |
| --------------- | ----------- | ------------------------------------- | ---------------------------------------------------- |
| Pull request    | Developer   | "Did I break the build?"              | Typecheck, lint, format, BDD compilation             |
| Push to main    | Developer   | "Is main still green after merge?"    | Same as PR                                           |
| Weekly schedule | QA Lead     | "Is the full suite trending healthy?" | All scenarios, full auth, Allure history             |
| Manual dispatch | QA Engineer | "Why is this specific test failing?"  | Tag-filtered tests, full traces, always-on artifacts |

The insight: **not every trigger needs to run every test.** A developer pushing a PR doesn't need to know whether the "Close milestone" scenario passed. They need to know their code compiles, their step definitions resolve, and nothing formats wrong.

Splitting into discrete workflows prevents:

- PR builds that take 20 minutes because they're running 37 full-browser scenarios
- Production credentials leaking into every contributor's fork
- Developers ignoring CI failures because "that test is always flaky anyway"

---

## Workflow 1: The PR gate (zero secrets)

This is the most important workflow and the one most teams get wrong. They wire up all their secrets, run the full suite, and wonder why PR builds take forever.

A PR gate should answer one question: **can this code safely merge?** — and it should answer it in under 2 minutes, without touching a single production credential.

```yaml
steps:
  - run: npm ci
  - run: npm run typecheck # Are the types correct?
  - run: npm run lint # Does the code follow the rules?
  - run: npm run format:check # Is it formatted consistently?
  - run: npm run bddgen # Do all .feature files compile?
```

That's it. Five steps. No `GITHUB_API_TOKEN`. No `GMAIL_APP_PASSWORD`. No browser.

What these five steps prove:

| Step                     | What it catches                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `typecheck`              | Missing functions, wrong parameter types, incorrect imports                                   |
| `lint`                   | Unused variables, missing awaits, forbidden patterns                                          |
| `format:check`           | Inconsistent indentation, trailing whitespace, missing semicolons (per your Prettier config)  |
| `npx playwright install` | Proves the Chromium binary can be downloaded in the CI environment                            |
| `bddgen`                 | Proves every `.feature` file parses, every step definition resolves, no Gherkin syntax errors |

The combination catches roughly 90% of problems that would fail a full test run — without ever launching a browser.

### Why bddgen alone is a powerful smoke test

If you're using playwright-bdd, `bddgen` is the compile step that transforms `.feature` files into executable `.spec.ts` files. It validates:

- Gherkin syntax (malformed tables, missing colons, incorrect keywords)
- Step definition resolution (every `Given`/`When`/`Then` maps to a function)
- Fixture wiring (every test gets the right fixture imports)

A test suite with 37 scenarios that successfully runs `bddgen` is statistically very likely to pass at runtime. The failures that slip through — network timeouts, DOM changes, rate limits — are exactly the failures that should be caught on a weekly schedule, not on every PR.

---

## Workflow 2: The full regression suite (secrets required)

This runs on a schedule (and manually) with every credential wired up:

```yaml
- run: npm test
  env:
    GITHUB_USERNAME: ${{ secrets.GITHUB_USERNAME }}
    GITHUB_PASSWORD: ${{ secrets.GITHUB_PASSWORD }}
    GMAIL_ADDRESS: ${{ secrets.GMAIL_ADDRESS }}
    GMAIL_APP_PASSWORD: ${{ secrets.GMAIL_APP_PASSWORD }}
    GITHUB_API_TOKEN: ${{ secrets.GITHUB_API_TOKEN }}
    TEST_MODE: full
```

### The auth problem in ephemeral containers

This is the elephant in the room that most tutorials ignore. If your tests authenticate against a real third-party service, CI runners are a nightmare — they're ephemeral, they have no persisted session, and every run is a "first run."

You have four options:

| Approach                                | Pros                           | Cons                                                 |
| --------------------------------------- | ------------------------------ | ---------------------------------------------------- |
| **Pre-generate auth token as a secret** | Fast, no login per run         | Token expires; manual refresh required               |
| **Full browser login every run**        | Always fresh, zero maintenance | Slow (30–60s); may trigger account security warnings |
| **Cache the auth state file**           | Fast after first run           | Cache misses = full login; session cookies expire    |
| **Cache with login fallback**           | Best of both                   | More YAML complexity                                 |

There's no universally correct answer. For a weekly schedule, full login per run is acceptable — the overhead is negligible at that cadence. For a nightly schedule running against a heavily-guarded service, a pre-generated token stored as a GitHub secret is more practical.

Whatever you choose, document when the token or session expires and who's responsible for refreshing it. An expired auth token will take down your entire pipeline silently — the tests will fail with authentication errors, not assertion errors, and you'll waste hours debugging the wrong thing.

---

## The `TEST_MODE` pattern: gating authenticated fixtures without per-test tags

This is the single most impactful pattern for keeping secrets out of PR builds.

Your project fixtures depend on sandbox credentials:

```typescript
function requireSandbox() {
  if (!env.hasSandboxProject) {
    throw new Error('GITHUB_API_TOKEN is required');
  }
}
```

Without credentials, every test that imports the project fixture crashes immediately — even tests that don't touch the sandbox. You could add `@skip-ci` tags to every sandbox-dependent test, but that's brittle and doesn't scale.

Instead, gate at the fixture level:

```typescript
function requireSandbox() {
  if (env.testMode === 'read-only') {
    test.skip(true, 'Skipping sandbox-dependent test in read-only mode');
  }
  if (!env.hasSandboxProject) {
    throw new Error('GITHUB_API_TOKEN is required');
  }
}
```

One check. Every sandbox-dependent fixture (`githubAPI`, `projectsAPI`, `sandbox`, `seededProjectIssue`) calls `requireSandbox()`. Every test that uses any of them gets skipped cleanly. No per-test annotations. No brittle grep filters. No maintenance burden as you add scenarios.

| Mode        | Who runs it                   | What happens to sandbox tests  |
| ----------- | ----------------------------- | ------------------------------ |
| `read-only` | PR CI                         | Skipped gracefully             |
| `full`      | Weekly schedule, manual debug | Runs normally with credentials |

---

## Reports for three audiences

One of the biggest mistakes in CI setup is treating reports as an afterthought — "just upload the artifact, someone will look at it." Different stakeholders need fundamentally different reports.

### Audience 1: The QA debugger (you, investigating a failure)

**Need:** "What broke, and what was the DOM state at the moment it broke?"

**What to configure:**

| Setting      | Value               | Why                                                                                 |
| ------------ | ------------------- | ----------------------------------------------------------------------------------- |
| `trace`      | `retain-on-failure` | Captures every DOM snapshot, network request, and console log from the failing test |
| `screenshot` | `only-on-failure`   | A single image of the failure state is often enough                                 |
| `video`      | `retain-on-failure` | Helpful for animations or timing-dependent failures                                 |

**How to access:** Download the `test-results` artifact from the workflow run, unzip, open with `npx playwright show-trace trace.zip`.

The trace viewer is Playwright's killer debugging feature. It's a full timeline of the test: every action, every DOM mutation, every network request, every console message. You can step through the test frame by frame. You can inspect the DOM at the exact moment an assertion failed. You can see the request/response pair for every API call.

A trace is worth a thousand screenshots.

### Audience 2: The QA lead (tracking suite health over time)

**Need:** "Are the tests getting better or worse? Which tests are flaky? Is the suite getting slower?"

**What to configure:**

| Tool                                | What it provides                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| Allure report                       | Feature → scenario → step hierarchy, severity labels, tag filtering              |
| Allure history cache                | Trend graphs: pass rate over last 20 runs, duration trends, flaky test detection |
| Severity labels (from Gherkin tags) | "Show me only blocker-severity failures"                                         |

**The history caching cycle is a 5-step dance:**

```
1. Restore history/ from GitHub Actions cache
2. Copy history/ into results/ before generating the report
3. Generate Allure report (combines new results with historical data)
4. Copy updated history/ out of the generated report
5. Save history/ back to the cache
```

Without this cycle, every Allure report is a one-off snapshot. You can see what passed and failed this run, but you can't see whether a test has passed 95% of the time or 40% of the time. You can't prove a test has been flaky for three weeks. You can't answer the release manager's question: "has the suite been green for the last 5 runs?"

With it, the Allure dashboard shows you:

- **Flaky tests:** which tests alternate between pass/fail
- **Duration trends:** which tests are getting slower (often a sign of accumulating test data)
- **Pass rate over time:** the go/no-go answer release managers need

### Audience 3: The release manager (go/no-go)

**Need:** "Can we ship? Show me the results at a glance."

**What to configure:**

| Need                                 | Solution                                 |
| ------------------------------------ | ---------------------------------------- |
| Single-page overview                 | Allure dashboard with severity filtering |
| All P0s green?                       | Filter by `severity: blocker`            |
| Any new failures since last release? | Allure history trend graph               |
| How long did the run take?           | Duration trend                           |

The release manager shouldn't need to download a zip file and run `npx allure open` locally. If you can, publish the Allure report to GitHub Pages so the answer to "can we ship?" is a URL, not a download.

---

## The debug workflow: investigating failures without cloning

When a test fails in CI, the default workflow is painful: clone the repo, set up the `.env`, install dependencies, run the failing test locally, and hope the failure reproduces.

A debug workflow eliminates that cycle:

```yaml
on:
  workflow_dispatch:
    inputs:
      tag:
        description: 'Gherkin tag to filter (e.g. @P0, @smoke)'
        type: string
        default: '@P0'
      trace:
        description: 'Trace mode'
        type: choice
        options: [on, retain-on-failure]
        default: on
      video:
        description: 'Video mode'
        type: choice
        options: [on, retain-on-failure, off]
        default: retain-on-failure
```

What makes a debug workflow different from the regular full suite:

| Aspect            | Full suite          | Debug workflow                                  |
| ----------------- | ------------------- | ----------------------------------------------- |
| Trigger           | Cron + manual       | Manual, tag input                               |
| Filter            | All scenarios       | Single Gherkin tag (`@P0`, `@smoke`, `@noauth`) |
| Trace mode        | `retain-on-failure` | `on` (always capture)                           |
| Video mode        | `retain-on-failure` | `retain-on-failure` or `on`                     |
| Artifacts on pass | Report only         | Report + traces + videos                        |
| Quality gates     | Yes                 | No (skipped for speed)                          |

The debug workflow should skip typecheck, lint, and format checks. When a test is failing at 3 AM, you don't want to wait for ESLint.

The `--trace on` flag overrides the Playwright config at runtime — no config file changes, no separate branch needed. The QA engineer types a Gherkin tag into the workflow dispatch form, clicks "Run," and has a full trace 5 minutes later.

---

## The CI readiness checklist

Here's the concrete list. When every item is checked, your CI pipeline is done.

| #   | Item                                                 | Why                                                                            |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | `tsc --noEmit` passes                                | Prevents type errors from reaching the test runner                             |
| 2   | `eslint 'src/' 'steps/'` passes                      | Catches unsafe patterns before they become test failures                       |
| 3   | `prettier --check '**/*.ts'` passes                  | Eliminates formatting noise from code review                                   |
| 4   | `bddgen` succeeds                                    | Proves all `.feature` files compile and all step definitions resolve           |
| 5   | PR workflow completes without secrets                | Developers can push without access to production credentials                   |
| 6   | Scheduled full suite runs end-to-end with auth       | The full 37 scenarios exercise real browsers against real data                 |
| 7   | Allure history is cached between runs                | Trend graphs work; flaky tests are detectable                                  |
| 8   | Debug workflow can run a single tag with full traces | You can investigate a CI failure without cloning the repo                      |
| 9   | Artifacts have a documented retention policy         | 7 days is typical; adjust based on your release cadence                        |
| 10  | Token/session expiry is documented                   | Someone knows to refresh the auth state before it silently breaks the pipeline |

---

## What success looks like

A mature CI pipeline doesn't just run tests. It answers questions for everyone on the team:

**Developer:** "My PR is green. I can merge." (Answer comes from `ci.yml` in under 2 minutes.)

**QA Engineer:** "The full suite ran on schedule. Here's the Allure dashboard." (Answer comes from `e2e-full.yml` with history enabled.)

**QA lead:** "Suite pass rate is 97% this month. Three tests show flaky patterns. Here's the trend data." (Answer comes from Allure history across multiple runs.)

**Release manager:** "All P0s are green. We're clear to ship." (Answer comes from severity-filtered Allure dashboard.)

**Bug investigator:** "Here's the trace from the failing test. The DOM state at failure shows why." (Answer comes from `e2e-debug.yml` with `trace: on`.)

If your pipeline can answer all five questions, you're not just running tests in CI. You're running an observability platform for your test suite.

---

_For the implementation story behind these patterns, see [Part 10 — CI/CD for the Paranoid QA](/blog/10-cicd-allure-caching-isolation). For a walkthrough of the repo's full architecture, see [Inside a Production-Grade Playwright E2E Repo](/architecture-tour)._
