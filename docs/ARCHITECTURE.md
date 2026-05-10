# Architecture — Playwright E2E Best Practices

> **Why we made the choices we made. For QA engineers evaluating this repo as a reference.**

---

## Design Principles

### 1. Real sites > Demo apps

We test against **production websites** (GitHub, Wikipedia, Hacker News) instead of demo apps (TodoMVC, SauceDemo). This forces us to confront real-world constraints:

- Hashed CSS class names → role-based locators are mandatory, not optional
- Progressive content loading → `waitForLoad()` is real, not theoretical
- Rate limiting → teaches CI strategy (read-only vs full)
- DOM changes → teaches test maintenance as a first-class concern

**Trade-off:** Tests can break when GitHub deploys. We treat this as a feature — it's the same problem QA engineers face daily.

### 2. Playwright fixtures > BaseTest classes

Playwright's fixture system replaces traditional `BaseTest` classes:

```typescript
// ❌ Anti-pattern: BaseTest class with beforeEach/afterEach
class BaseTest {
  async beforeEach() {
    /* setup */
  }
  async afterEach() {
    /* teardown */
  }
}

// ✅ Playwright way: fixtures with auto-setup/teardown
const test = base.extend<MyFixtures>({
  authenticatedPage: async ({ browser }, use) => {
    const page = await setupAuth(browser);
    await use(page); // ← test runs here
    await cleanup(page); // ← always runs, even on failure
  },
});
```

**Why fixtures win:**

- Composeable — a test can use multiple fixtures without inheritance chains
- Auto-cleanup — teardown runs even if the test fails (critical for data lifecycle)
- Type-safe — TypeScript enforces correct fixture usage
- Parallel-safe — each worker gets isolated fixture instances

### 3. Role-based locators > CSS/XPath

GitHub's CSS classes look like `Box-sc-g0xbh4-0 gWHNVC`. They change on every deploy. The industry
best practice — enshrined in Playwright's own docs — is the locator priority:

1. **`getByRole()`** — preferred, matches ARIA semantics
2. **`getByLabel()` / `getByPlaceholder()`** — form fields
3. **`getByText()`** — visible text content
4. **`getByTestId()`** — last resort (but we can't add `data-testid` to GitHub)

```typescript
// ✅ Survives GitHub deploys
page.getByRole('button', { name: 'Sign in' });

// ❌ Breaks next deploy
page.locator('.BtnGroup-form > .btn-primary');
```

### 4. Data lifecycle: seed → verify → cleanup

Every test that creates data follows a strict lifecycle enforced by fixtures:

```typescript
const test = base.extend<{ seededIssue: Issue }>({
  seededIssue: async ({ request, dataManager }, use) => {
    // 1. SEED — create resource via API
    const issue = await api.createIssue(repo, { title: `test-${Date.now()}` });

    // 2. ENQUEUE CLEANUP — guaranteed to run
    dataManager.enqueue(() => api.closeIssue(repo, issue.number));

    // 3. HAND OFF — test runs
    await use(issue);

    // 4. CLEANUP — DataManager runs all enqueued tasks (even on failure)
  },
});

test('verify issue appears in UI', async ({ page, seededIssue }) => {
  await page.goto(seededIssue.html_url);
  await expect(page.getByRole('heading')).toContainText(seededIssue.title);
});
```

**The DataManager** is a queue of async cleanup tasks. It guarantees execution even when
the test fails mid-way — preventing test pollution between runs.

### 5. Gherkin for specs, pure Playwright for technical tests

We use **both** patterns, not one or the other:

| Gherkin (playwright-bdd)            | Pure Playwright                             |
| ----------------------------------- | ------------------------------------------- |
| Business-readable scenarios         | Technical tests                             |
| Login flows, search flows           | API tests, visual regression, accessibility |
| Product can read and verify         | Developer-focused                           |
| `features/*.feature` + `steps/*.ts` | `tests/**/*.spec.ts`                        |

**Why not Cucumber.js?** Playwright-BDD runs on the native Playwright test runner —
fixtures, tracing, sharding, and reporters all work without configuration. Cucumber.js
requires a separate runner, separate World setup, and manual parallel orchestration.

### 6. CI strategy: read-only by default

Running E2E tests against real sites in CI requires discipline:

```yaml
# GitHub Actions — two workflows, one gate

# Workflow 1: PR checks (fast, read-only, sharded)
on: [pull_request]
jobs:
  test:
    env:
      TEST_MODE: read-only
    steps:
      - run: npx playwright test --grep "@smoke" --shard=${{ matrix.shard }}

# Workflow 2: Nightly full suite (includes authenticated + visual)
on:
  schedule:
    - cron: '0 6 * * 1'  # Monday mornings
```

**Why read-only CI?**

- No credentials stored in CI secrets
- No rate-limit risk from parallel shards
- No risk of polluting a real GitHub repo with test data
- Catches regression from GitHub deploys without touching their API

---

## Directory Structure Rationale

```
playwright-e2e/
├── docs/                  # Decision records, test plan — NOT code
│   ├── TEST-PLAN.md       # What we test and why
│   └── ARCHITECTURE.md    # This file
│
├── features/              # Gherkin specs — product-readable
│   └── github/            # Organized by target, not by test type
│       └── login.feature
│
├── steps/                 # Step definitions — one-to-one with features
│   └── github/
│       └── login.steps.ts
│
├── tests/                 # Pure Playwright tests
│   ├── e2e/               # UI-driven end-to-end
│   ├── api/               # API-only (request fixture)
│   ├── visual/            # Screenshot comparison
│   └── accessibility/     # Axe-core audits
│
├── src/
│   ├── pages/             # Page Object Models (per target)
│   │   └── github/        # GitHubLoginPage, GitHubRepoPage, etc.
│   ├── components/        # Reusable UI pieces
│   │   └── github/        # NavigationBar, RepositoryCard
│   ├── fixtures/          # Auto-setup/teardown test fixtures
│   ├── utils/             # DataManager, APIClient, wait helpers
│   ├── data/              # Static test data (JSON)
│   └── config/            # Playwright config, env config, global setup
│
├── auth/                  # Storage state JSONs — GITIGNORED
│
├── content/               # Blog posts, diagrams, video scripts
│   ├── blog/
│   ├── diagrams/
│   └── video-scripts/
│
└── .features-gen/         # Auto-generated by playwright-bdd — GITIGNORED
```

**Why organize pages by target?** A test against GitHub should never import a Wikipedia
page object. Namespacing by target (`src/pages/github/`, `src/pages/wikipedia/`) makes
this boundary explicit.

---

## Key Patterns

### Pattern 1: Resilient BasePage

```typescript
export abstract class BasePage {
  protected readonly page: Page;
  abstract readonly url: string;

  async navigate(): Promise<void> {
    await this.page.goto(this.url, { waitUntil: 'domcontentloaded' });
    await this.waitForLoad();
  }

  abstract waitForLoad(): Promise<void>; // Each page knows its own ready signal

  async safeClick(locator: Locator): Promise<void> {
    await expect(locator).toBeVisible({ timeout: 10_000 });
    await locator.click();
  }

  async fillAndBlur(locator: Locator, text: string): Promise<void> {
    await locator.fill(text);
    await locator.blur(); // Triggers validation on blur
  }
}
```

### Pattern 2: Fixture-injected page objects

```typescript
// Instead of: const loginPage = new LoginPage(page);
// Use fixture injection:

const test = base.extend<{ loginPage: LoginPage }>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
});

test('login works', async ({ loginPage }) => {
  await loginPage.navigate();
  await loginPage.login(user, pass);
});
```

### Pattern 3: API client wrapper

```typescript
class GitHubAPI {
  constructor(private request: APIRequestContext) {}

  async createIssue(repo: string, data: { title: string; body: string }) {
    const response = await this.request.post(`/repos/${repo}/issues`, { data });
    return response.json();
  }

  async closeIssue(repo: string, issueNumber: number) {
    await this.request.patch(`/repos/${repo}/issues/${issueNumber}`, {
      data: { state: 'closed' },
    });
  }
}
```

### Pattern 4: Playwright-BDD step definitions reuse fixtures

```typescript
// steps/github/login.steps.ts
import { createBdd } from 'playwright-bdd';
import { test } from '../../src/fixtures/github.fixture';

const { Given, When, Then } = createBdd(test);

Given('I am on the GitHub login page', async ({ loginPage }) => {
  await loginPage.navigate();
});

When('I login with valid credentials', async ({ loginPage }) => {
  await loginPage.login(env.github.username, env.github.password);
});

Then('I should see the dashboard', async ({ page }) => {
  await expect(page).toHaveURL(/github.com/);
});
```

---

## Tech Stack Decisions

| Choice                | Alternative        | Why We Chose It                                                            |
| --------------------- | ------------------ | -------------------------------------------------------------------------- |
| **Playwright-BDD**    | Cucumber.js        | Native Playwright runner — fixtures, tracing, sharding work out of the box |
| **Allure**            | Only HTML reporter | Historical trends, CI-friendly JSON, better for presentations              |
| **CommonJS modules**  | ESM                | Node ecosystem stability; avoid dual-package hazard with Playwright        |
| **Strict TypeScript** | Relaxed config     | Catch null/undefined bugs at compile time                                  |
| **`tsx`** for scripts | `ts-node`          | Faster startup, no config needed                                           |
| **dotenv**            | Built-in env       | Explicit `.env` loading, works with `playwright.config.ts`                 |

---

## Anti-Patterns We Avoid

| Anti-Pattern                           | Why It's Wrong                   | Our Approach                                            |
| -------------------------------------- | -------------------------------- | ------------------------------------------------------- |
| `page.waitForTimeout(5000)`            | Brittle, slows suite             | `expect(locator).toBeVisible()` with auto-wait          |
| CSS class selectors on 3rd-party sites | Breaks on every deploy           | `getByRole()`, `getByText()`                            |
| `beforeEach` for data setup            | No guaranteed cleanup on failure | Fixtures with `use()` pattern                           |
| Hardcoded credentials                  | Security risk, can't share repo  | `.env` + `.env.example`                                 |
| One test = one assertion               | Overhead of page loads           | Multiple related assertions per test (logical grouping) |
| Testing everything in CI               | Rate limits, flakiness           | Read-only CI, full suite local/manual                   |
