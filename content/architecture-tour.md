# Inside a Production-Grade Playwright E2E Repo — Architecture Tour

A guided walkthrough of how we structure real-website E2E testing with Playwright + TypeScript, testing GitHub's project management features as a Jira-like target.

---

## Why This Exists

Most Playwright tutorials test against demo apps — TodoMVC, a local React app, or some `the-internet.herokuapp.com` page. These are fine for learning the API, but they hide the real problems QA engineers face daily:

- CSS classes that change on every deploy
- Shadow DOM in web components
- Rate limits and auth tokens that expire
- Duplicate DOM elements with identical ARIA roles
- Headless vs headed rendering differences

This repo tests **real GitHub** — login, issues, kanban boards, labels, milestones, the whole project management surface. It's the same patterns you'd use to test Jira, Linear, or Asana.

Here's how it's built.

---

## Directory Map

```
playwright-e2e/
├── docs/                     # TEST-PLAN.md, ARCHITECTURE.md
├── features/                 # Gherkin .feature files (BDD)
│   └── github/
│       └── login.feature
├── steps/                    # Step definitions
│   └── github/
│       └── login.steps.ts
├── tests/                    # Pure Playwright tests
│   ├── e2e/
│   ├── api/
│   └── visual/
├── src/
│   ├── pages/                # Page Object Models
│   │   └── github/
│   │       └── LoginPage.ts
│   ├── fixtures/             # Custom test fixtures (the heart)
│   │   └── github-project.fixture.ts
│   ├── utils/                # API clients, DataManager
│   │   ├── api-client.ts            # REST (issues, labels, comments)
│   │   ├── github-projects-api.ts   # GraphQL (boards, fields, items)
│   │   └── data-manager.ts          # Guaranteed cleanup queue
│   ├── data/                 # Static test data
│   └── config/               # playwright.config, env.config
├── auth/                     # Storage state — gitignored
└── .features-gen/            # BDD generated — gitignored
```

---

## The Architecture

### 1. Fixture Layering — Not a BaseTest

Playwright fixtures compose. A `BaseTest` class with a `beforeEach` doesn't — if the `beforeEach` fails, you get no teardown. Fixtures with `use()` guarantee cleanup runs *even on failure*.

Here's our fixture tree:

```
dataManager          ← cleanup queue, always at the bottom
  ├── githubAPI      ← REST client (issues, labels, comments)
  ├── projectsAPI    ← GraphQL client (boards, items, fields)
  │     └── sandbox           ← resolved project context (projectId, statusFieldId, options)
  │           └── seededProjectIssue  ← creates issue + adds to board + auto-cleans
```

Each fixture depends only on the ones above it. Stateless fixtures (API clients) resolve once per worker. Stateful ones (seeded data) run per test.

```typescript
export const test = base.extend<ProjectFixtures>({
  dataManager: async ({}, use) => {
    const dm = new DataManager();
    await use(dm);
    await dm.cleanupAll();  // ← ALWAYS runs, even if the test throws
  },

  githubAPI: async ({ request }, use) => {
    const api = new GitHubAPI(request, env.github.token);
    await use(api);
  },

  projectsAPI: async ({ request }, use) => {
    const api = new GitHubProjectsAPI(request, env.github.token);
    await use(api);
  },

  sandbox: async ({ projectsAPI }, use) => {
    const { projectId, statusFieldId, statusOptions } =
      await projectsAPI.resolveProject(owner, projectNumber);
    await use({ projectId, statusFieldId, statusOptions });
  },

  seededProjectIssue: async ({ githubAPI, projectsAPI, sandbox, dataManager }, use) => {
    const issue = await githubAPI.createIssue(repo, { title: `e2e-${Date.now()}` });
    const itemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);
    // Enqueue cleanup (LIFO — project removal runs first, then close)
    dataManager.enqueue(() => projectsAPI.removeItemFromProject(sandbox.projectId, itemId));
    dataManager.enqueue(() => githubAPI.closeIssue(repo, issue.number));
    await use({ ...issue, projectItemId: itemId });
  },
});
```

### 2. Two API Clients — REST and GraphQL

GitHub splits its API surface. Issues, labels, comments, milestones? **REST**. Project boards, kanban columns, custom fields, item status? **GraphQL only.** There is no REST endpoint for GitHub Projects V2.

**REST client** (`GitHubAPI`) wraps Playwright's built-in `request` fixture:

```typescript
export class GitHubAPI {
  async createIssue(repo: string, params: CreateIssueParams): Promise<GitHubIssue> {
    const response = await this.request.post(
      `${this.baseUrl}/repos/${repo}/issues`,
      { headers: this.authHeaders(), data: params }
    );
    return response.json();
  }
}
```

**GraphQL client** (`GitHubProjectsAPI`) uses the same `request` fixture to POST to `/graphql`:

```typescript
export class GitHubProjectsAPI {
  async addIssueToProject(projectId: string, contentId: string): Promise<string> {
    const data = await this.graphql<{ addProjectV2ItemById: { item: { id: string } } }>(`
      mutation($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
          item { id }
        }
      }
    `, { projectId, contentId });
    return data.addProjectV2ItemById.item.id;
  }
}
```

No extra HTTP library. Playwright's `APIRequestContext` handles auth, retries, and cookies — same context as the browser.

### 3. DataManager — Guaranteed Cleanup

Every test that creates resources enqueues a cleanup function. The DataManager runs them all in **reverse order** (LIFO — child resources cleaned before parents), even if the test fails:

```typescript
export class DataManager {
  private cleanupQueue: Array<() => Promise<void>> = [];

  enqueue(fn: () => Promise<void>): void {
    this.cleanupQueue.push(fn);
  }

  async cleanupAll(): Promise<void> {
    const errors: Error[] = [];
    for (const fn of this.cleanupQueue.reverse()) {
      try { await fn(); } catch (error) { errors.push(error as Error); }
    }
    if (errors.length > 0) {
      console.warn(`DataManager: ${errors.length} cleanup task(s) failed`);
    }
  }
}
```

One failed cleanup doesn't block the rest. If 3 out of 4 cleanups succeed, you get a warning — not a cascade of test pollution.

### 4. The Persistent Sandbox Pattern

We don't create/destroy a project per test run. That's slow, hits rate limits, and adds flakiness. Instead:

- **One kanban board** is created once manually in GitHub (`kanban-board`, project #8)
- **Each test seeds** its own issues with unique names (`e2e-${Date.now()}-${random4chars}`)
- **Each test cleans up** what it created — removes from board, closes the issue
- **The board itself** lives forever

This is "Approach A" in the test plan. Parallel tests never collide because every seeded issue has a unique timestamped name.

---

## Page Objects — Role-Based, Not CSS

GitHub hashes its CSS class names. `.d-sm-flex` today is `.xpc-8b2` tomorrow. So we use **only** ARIA role, label, and text locators:

```typescript
export class LoginPage {
  constructor(public readonly page: Page) {
    this.usernameInput = page.getByLabel('Username or email address');
    this.passwordInput = page.getByLabel('Password');
    this.signInButton = page.getByRole('button', { name: 'Sign in', exact: true });
    this.errorMessage = page.getByRole('alert');
  }
}
```

The `exact: true` on the sign-in button is not optional. GitHub's login page has two "Sign in" buttons:
1. The submit input (`<input type="submit" value="Sign in">`)
2. A passkey prompt (`<button>Sign in with a passkey</button>`)

Without `exact: true`, Playwright throws a strict mode violation — two elements match `getByRole('button', { name: 'Sign in' })`.

---

## BDD Layer — playwright-bdd

We use `playwright-bdd` (not Cucumber.js) — it's lighter, type-safe, and integrates directly with Playwright fixtures:

```gherkin
Feature: GitHub Login
  Scenario: Login with invalid credentials shows error
    Given I am on the GitHub login page
    When I login with username "test-user" and password "wrong-password"
    Then I should see an error message "Incorrect username or password"
```

The step definitions receive the full fixture context — no global state, no `this.world`:

```typescript
import { createBdd } from 'playwright-bdd';
import { test } from '../../src/fixtures/github-project.fixture';

const { Given, When, Then } = createBdd(test);

Given('I am on the GitHub login page', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
});
```

---

## Config — Chromium-First, Video on Failure

Start with one browser. Add Firefox and WebKit when the suite is stable — multi-browser runs cost more CI minutes:

```typescript
export default defineConfig({
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'https://github.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

`video: 'retain-on-failure'` means every failed test leaves a `.webm` in `test-results/` — you can watch exactly what the browser saw.

---

## What's Next

The test plan covers 37 scenarios across 16 areas — Issue CRUD, Labels, Milestones, Assignees, Board Workflow, Table Views, Comments, Bulk Operations, Custom Fields, Draft Items, Archive, and more.

Only the foundation is built: the architecture, the API clients, the data lifecycle, and the login flow. The real work — automating all 37 scenarios — starts now.

---

*This is part 1 of a series on real-website E2E testing with Playwright. Follow for part 2: "What Testing GitHub's Kanban Board Taught Me About Shadow DOM, Duplicate Locators, and Headless Rendering."*
