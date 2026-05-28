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

### 5. BDD-first: Gherkin for everything

All tests in this repository use the BDD (Gherkin) pattern via `playwright-bdd`. There is no `tests/` directory — every scenario lives in `.feature` files with corresponding step definitions:

| Feature File                             | Step File                              | Fixture Used                |
| ---------------------------------------- | -------------------------------------- | --------------------------- |
| `features/github/login.feature`          | `steps/github/login.steps.ts`          | `github.fixture.ts`         |
| `features/github/issue-crud.feature`     | `steps/github/issue-crud.steps.ts`     | `github-project.fixture.ts` |
| `features/github/board-workflow.feature` | `steps/github/board-workflow.steps.ts` | `github-project.fixture.ts` |
| `features/github/labels.feature`         | `steps/github/labels.steps.ts`         | `github-project.fixture.ts` |

**Why no `tests/` directory?** We chose consistency over flexibility. When all tests follow the same BDD pattern, onboarding is simpler, step reuse is automatic across features, and the reporting layer (Allure, Playwright HTML) presents a unified view.

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
│       ├── login.feature
│       ├── issue-crud.feature
│       ├── board-workflow.feature
│       └── labels.feature
│
├── steps/                 # Step definitions — one-to-one with features
│   └── github/
│       ├── login.steps.ts
│       ├── issue-crud.steps.ts
│       ├── board-workflow.steps.ts
│       └── labels.steps.ts
│
├── src/
│   ├── pages/             # Page Object Models (per target)
│   │   └── github/        # LoginPage
│   ├── fixtures/          # Auto-setup/teardown test fixtures
│   │   ├── github.fixture.ts
│   │   └── github-project.fixture.ts
│   ├── utils/             # DataManager, APIClient, GraphQL, Auth helper
│   │   ├── data-manager.ts
│   │   ├── api-client.ts
│   │   ├── github-projects-api.ts
│   │   └── github-auth.ts
│   └── config/            # Playwright config, env config, global setup
│       ├── global-setup.ts
│       └── env.config.ts
│
├── auth/                  # Storage state JSONs — GITIGNORED
│
├── blog/               # Blog posts, tutorials (EN + ID)
│   └── blog/
│
└── .features-gen/         # Auto-generated by playwright-bdd — GITIGNORED
```

**Why organize pages by target?** A test against GitHub should never import a Wikipedia
page object. Namespacing by target (`src/pages/github/`, `src/pages/wikipedia/`) makes
this boundary explicit.

---

## Key Patterns

### Pattern 1: Fixture-centric Page Objects (No BasePage)

In traditional Selenium-based frameworks, a `BasePage` class is used to share helper methods, standard assertions, and navigation logic.

In Playwright, we purposefully **do not use** a `BasePage` base class.

#### Why we avoid BasePage:

- **Playwright already provides standard wrappers**: Helper methods like `safeClick` or `fillAndBlur` are unnecessary because Playwright's native locators include auto-waiting, retries, and actionability checks out of the box.
- **Composition over inheritance**: Page Objects should be self-contained components. Shared setup or teardown logic is better handled by **Playwright Fixtures**, which manage context lifecycle, dependency injection, and cleanups in a modular way.
- **Strict typing**: An inheritance model can lead to typing pollution or circular dependencies as pages extend pages.

Instead, our Page Object Models are simple classes that receive the standard Playwright `Page` via constructor injection and define clean, descriptive interfaces for interacting with specific pages or components:

```typescript
export class IssuePage {
  constructor(private readonly page: Page) {}

  async navigate(repo: string, issueNumber: number) {
    await this.page.goto(`/${repo}/issues/${issueNumber}`);
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

> **Note on `waitForTimeout`:** The board workflow step uses `page.waitForTimeout(1000)` after confirming a GraphQL mutation via `toPass`. This is a pragmatic exception — GitHub's GraphQL API exhibits eventual consistency where a read confirms the mutation but a subsequent read returns the old value. The 1-second buffer is placed after the mutation is _confirmed_ (not instead of confirmation), making it a stability buffer rather than a blind wait.
