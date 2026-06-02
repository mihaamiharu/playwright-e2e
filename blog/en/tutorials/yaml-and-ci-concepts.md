# YAML & CI/CD Concepts for QA Engineers: What You Need Before Writing Your First Workflow

YAML is the language of CI pipelines. Every GitHub Actions workflow, every GitLab CI config, every CircleCI config is YAML. If you're a QA engineer responsible for test automation that runs in CI, you need to read and write YAML fluently. This guide covers the concepts you'll actually use — not everything YAML can do, just what shows up in test automation workflows every day.

---

## What is YAML?

YAML stands for "YAML Ain't Markup Language." It's a data serialization format, like JSON or XML, designed to be readable by humans. It's not a programming language — there are no loops, no conditionals, no functions. It's just structured data.

### The three things YAML can express

Every YAML file you'll ever write consists of three building blocks:

**1. Key-value pairs (mappings)**

```yaml
name: CI
on: push
```

Think of it as a dictionary. The colon separates the key from the value. There must be a space after the colon.

**2. Lists (sequences)**

```yaml
branches:
  - main
  - develop
```

The dash means "item in a list." The indentation before the dash means "this list belongs to `branches`."

**3. Nested combinations**

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - run: npm test
```

`jobs` is a mapping. Inside it, `test` is a job name (a key). Inside that, `runs-on` is a key with a simple value, and `steps` is a key whose value is a list of two items — each with their own nested keys.

That's the entire mental model. Everything else — anchors, multiline strings, merge keys — are convenience features built on these three primitives.

---

## The CI/CD mental model

CI/CD pipelines follow a consistent pattern regardless of platform:

```
TRIGGER → JOB → STEPS
```

**Trigger:** What causes the pipeline to start. A push to `main`. A pull request. A scheduled time. A manual button click.

**Job:** A single execution unit. It runs on its own runner — a fresh virtual machine provisioned from scratch. If you have 3 jobs in a workflow, each gets its own VM.

**Steps:** The commands inside a job. They run sequentially in the same VM. Step 2 sees everything Step 1 created (files, environment variables, installed packages).

The critical insight for QA: **every CI run starts from a blank slate.** There is no `node_modules/`, no `auth/`, no `.env`, no persisted browser state. If your test needs it, a step in your workflow must create it.

This is why CI pipelines always start with:

```yaml
- uses: actions/checkout@v4 # Get the code
- uses: actions/setup-node@v4 # Install Node.js
- run: npm ci # Install dependencies
```

---

## Your first workflow, line by line

Let's take the simplest real test-automation workflow and explain every line.

```yaml
name: CI
```

The display name. This is what shows up in the GitHub Actions tab. Keep it short.

```yaml
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
```

The triggers. This workflow runs when someone opens a PR targeting `main`, pushes new commits to that PR, or pushes directly to `main`. The `branches` filter prevents it from running on feature branches that don't target `main`.

```yaml
jobs:
```

Every workflow has exactly one `jobs` key. All the work lives under it.

```yaml
quality:
```

A job name. You pick it. Multiple jobs in the same workflow run in parallel by default. If you need sequential execution, you use the `needs` key — but for test automation, parallel is usually what you want.

```yaml
runs-on: ubuntu-latest
```

The runner OS. GitHub Actions offers `ubuntu-latest`, `windows-latest`, and `macos-latest`. For browser testing with Playwright, `ubuntu-latest` is the default — it's fast, cheap, and Playwright installs Chromium with a single command.

```yaml
steps:
```

Everything between this line and the end of the job is a list of steps.

```yaml
- uses: actions/checkout@v4
```

`uses` runs a pre-built action — someone else's code. `actions/checkout@v4` clones your repository into the runner's workspace. `@v4` is the version tag. Pinning to a major version (`v4`) gets you non-breaking updates automatically.

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: lts/*
```

Another action. This installs Node.js on the runner. The `with` block passes parameters — here, telling it to use the latest LTS release. Without this step, `npm` doesn't exist on the runner.

```yaml
- run: npm ci
```

`run` executes a shell command directly — this is where your own logic goes. `npm ci` is a clean install: it deletes `node_modules/` if it exists and installs exactly what's in `package-lock.json`. In CI, always use `npm ci`, never `npm install`. The `i` in `npm i` can update the lockfile; `ci` cannot.

```yaml
- run: npm run typecheck
- run: npm run lint
- run: npm run format:check
```

Your quality gates. Three separate `run` steps for clarity — if `typecheck` fails, the error log immediately tells you it was a type error, not a lint error.

```yaml
- run: npx playwright install --with-deps chromium
```

Installs the Chromium browser binary. `--with-deps` installs OS-level dependencies (like `libgbm1`, `libnss3`) that browsers need on Linux but that aren't included in the default runner image.

```yaml
- run: npm run bddgen
```

If you're using playwright-bdd, this generates `.spec.ts` files from `.feature` files. It's your compile step. If a Gherkin file has a syntax error, this step catches it before any test runs.

---

## How triggers work

The `on` block determines when a workflow fires. QA engineers need to know four:

### `push`

```yaml
on:
  push:
    branches: [main]
```

Fires when someone pushes a commit to `main`. Use this for your "is main still green after merge?" workflow.

### `pull_request`

```yaml
on:
  pull_request:
    branches: [main]
```

Fires when a PR is opened or updated targeting `main`. This is your PR gate — typecheck, lint, bddgen. Runs in the context of the feature branch, not `main`.

### `schedule`

```yaml
on:
  schedule:
    - cron: '0 1 * * 0'
```

Fires on a timer using cron syntax. The five fields are: minute, hour, day-of-month, month, day-of-week (UTC). `0 1 * * 0` means "1:00 AM UTC every Sunday." Use this for your full regression suite.

### `workflow_dispatch`

```yaml
on:
  workflow_dispatch:
    inputs:
      tag:
        description: 'Gherkin tag to filter'
        type: string
        default: '@P0'
```

Adds a "Run workflow" button in the GitHub Actions UI. The `inputs` block creates form fields — the person triggering the workflow fills them in before clicking run. Use this for your debug workflow: the QA engineer types `@P0` into the form, clicks run, and gets a full trace 5 minutes later.

### How forks affect triggers

If someone forks your repo and opens a PR, the `pull_request` trigger fires — but with **no access to your repository secrets**. This is a security feature: a PR from an untrusted fork cannot read `${{ secrets.GITHUB_API_TOKEN }}`. If your workflow requires secrets to run tests, it will fail on fork PRs. This is why PR gates should not require credentials.

---

## Secrets and environment variables

### GitHub Secrets

Secrets are encrypted variables stored in GitHub's settings. You set them once in the repo UI (Settings → Secrets and variables → Actions), and reference them in workflows:

```yaml
- run: npm test
  env:
    GITHUB_USERNAME: ${{ secrets.GITHUB_USERNAME }}
    GITHUB_API_TOKEN: ${{ secrets.GITHUB_API_TOKEN }}
```

The `${{ }}` syntax is GitHub Actions' expression syntax. It's evaluated at runtime. `${{ secrets.X }}` is replaced with the secret's value — but only in the runner's memory. The value never appears in logs (GitHub automatically redacts it).

### The `.env` file vs CI secrets

Locally, you keep credentials in a `.env` file that's gitignored:

```
GITHUB_USERNAME=my-test-account
GITHUB_PASSWORD=my-password
```

In CI, there is no `.env` file. You pass the same values through `env:` blocks in the workflow. Your test code shouldn't care where the values come from — it reads `process.env.GITHUB_USERNAME` either way. The workflow is just a different delivery mechanism for the same environment variables.

### Why PR builds from forks can't access secrets

This is the most important security concept in CI for QA. When someone opens a PR from a fork:

```yaml
env:
  GITHUB_API_TOKEN: ${{ secrets.GITHUB_API_TOKEN }} # → empty string
```

The secret injection returns an empty string. GitHub does this to prevent a malicious PR from exfiltrating your credentials (e.g., `console.log(process.env.GITHUB_API_TOKEN)` inside a test).

**The practical consequence:** Your PR workflow must work without secrets. That means either:

- Only run quality gates (typecheck, lint, bddgen) on PR, or
- Use `TEST_MODE=read-only` to skip tests that need credentials

---

## Artifacts: getting files out of the runner

The runner's filesystem is ephemeral. When a job finishes, the VM is destroyed and everything on it is gone — including test reports, traces, and screenshots.

Artifacts are how you preserve files beyond the runner's lifetime:

```yaml
- name: Upload HTML Report
  uses: actions/upload-artifact@v4
  with:
    name: playwright-report
    path: reports/playwright/
    retention-days: 7
```

This uploads the `reports/playwright/` directory as a named artifact. After the workflow completes, you can download it from the workflow run page. `retention-days` controls how long GitHub keeps it before auto-deleting.

### `if: always()` and `if: failure()`

By default, a step only runs if all previous steps succeeded. For artifact uploads, you usually want the opposite — you want the report even if tests failed:

```yaml
- name: Upload HTML Report
  if: always()
  uses: actions/upload-artifact@v4
```

`if: always()` means "run this step regardless of whether previous steps passed or failed." Common patterns:

| Condition       | When to use                                                        |
| --------------- | ------------------------------------------------------------------ |
| (no `if`)       | Only run if everything succeeded                                   |
| `if: always()`  | Always upload (reports, logs)                                      |
| `if: failure()` | Only upload when tests failed (raw traces, videos — saves storage) |

For a debug workflow, all three artifact uploads use `if: always()` — when you're investigating a failure, you want everything even if the test somehow passed.

---

## Consolidated reports: one directory, one gitignore entry

A small but meaningful pattern: route all test output into a single directory.

```
reports/
  playwright/        # HTML report
  allure/
    results/         # raw Allure JSON
    report/          # generated Allure HTML
    history/         # CI trend data (cached between runs)
  artifacts/         # traces, videos, screenshots
```

Why this matters:

| Before (scattered)                         | After (consolidated)       |
| ------------------------------------------ | -------------------------- |
| 4 directories to gitignore                 | 1 line: `reports/`         |
| Unclear which folder is which              | Self-documenting structure |
| Artifact uploads reference different paths | All under `reports/`       |
| Hard to clean up locally after test runs   | `rm -rf reports/`          |

The Playwright config maps reporters to paths:

```typescript
outputDir: 'reports/artifacts',
reporter: [
  ['html', { outputFolder: 'reports/playwright' }],
  ['allure-playwright', { resultsDir: 'reports/allure/results' }],
  ['line'],
],
```

One config file change. All report consumers — local `npm run report`, CI artifact upload, Allure history cache — automatically follow.

---

## Glossary

| Term                                    | What it means in one sentence                                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **YAML**                                | A data format that uses indentation instead of brackets — everything in CI is written in it.                     |
| **CI** (Continuous Integration)         | Running automated checks (tests, lints, builds) on every code change.                                            |
| **CD** (Continuous Delivery/Deployment) | Automatically shipping code that passes CI — not covered in this guide, but the term shows up.                   |
| **Workflow**                            | A YAML file in `.github/workflows/` that defines a CI/CD pipeline.                                               |
| **Job**                                 | A single unit of work inside a workflow — gets its own fresh virtual machine.                                    |
| **Step**                                | A single command or action inside a job — runs sequentially on the same VM.                                      |
| **Runner**                              | The virtual machine that executes your workflow — ephemeral, destroyed after the job finishes.                   |
| **Trigger**                             | What starts a workflow: a push, a PR, a schedule, or a manual click.                                             |
| **Secret**                              | An encrypted variable stored in GitHub — referenced as `${{ secrets.NAME }}`, never printed in logs.             |
| **Artifact**                            | A file or directory uploaded from the runner before it's destroyed — your test reports, traces, and screenshots. |

---

## What you know now

You understand the YAML building blocks (key-value, lists, nesting), the CI/CD mental model (trigger → job → steps), the four trigger types and when to use each, how secrets work and why PR builds can't access them, and how artifacts save your test results from the ephemeral void.

Everything else — caching, matrix strategies, reusable workflows, deployment environments — builds on these foundations. But you can read, write, and debug a test-automation workflow right now.

---

_Next: [CI/CD for QA Engineers: A Decision Framework](/cicd-for-qa-engineers) — what to run, when, for whom. For the implementation story, see [Part 10 — CI/CD for the Paranoid QA](/blog/10-cicd-allure-caching-isolation)._
