# I Needed a Real Site to Test. Demo Apps Weren't Cutting It. So I Chose GitHub.

I wanted to build a production-grade E2E testing framework. Not against a TodoMVC. Not against a demo app that returns perfect JSON. Against something real — a live production site with rate limits, authentication traps, DOM that changes on every deploy, and APIs that don't always do what the docs say.

Turns out, finding a good target is harder than building the tests.

---

## The search for a real testing target

The internet is full of "test automation demo sites." They're designed to be easy. Predictable selectors. No auth. No rate limits. They're great for learning Playwright's API, but they teach you nothing about what testing actually looks like in production.

I could build my own target app — a Jira clone, a Trello clone, something with tickets and boards. But that's not the point. I'm not here to build apps. I'm here to test them. And the hardest part of testing isn't writing assertions — it's dealing with constraints you didn't choose and can't control:

- Rate limiters that throttle you after 60 requests
- 2FA device verification on every headless browser session
- Shadow DOM in web components that hides elements from `document.querySelector()`
- APIs split across REST and GraphQL with no unified client
- Duplicate ARIA roles that break strict-mode locators

If my test target never fights back, I'm not testing — I'm just writing scripts.

---

## Why GitHub Projects

I landed on [GitHub Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects). It's GitHub's project management surface — kanban boards, issues, labels, milestones, custom fields, the works. And it's close enough to Jira, Linear, and Asana that the testing patterns transfer directly:

| Jira Concept           | GitHub Projects Equivalent                        |
| ---------------------- | ------------------------------------------------- |
| Issue                  | Issue                                             |
| Board                  | Board view (Kanban)                               |
| Labels / Components    | Labels                                            |
| Sprints / Fix Versions | Milestones / Iterations                           |
| Custom Fields          | Custom Fields (Text, Number, Date, Single Select) |
| JQL Filters            | Saved Views with filters                          |
| Bulk Change            | Bulk operations                                   |
| Post-Functions         | Auto-workflows                                    |

But here's the real reason: GitHub doesn't make it easy.

- **CSS classes are hashed** — `.d-sm-flex` becomes `.xpc-8b2` on every deploy.
- **Projects V2 is GraphQL-only** — there is no REST endpoint for boards, columns, or item moves.
- **The kanban board uses web components** — items render inside shadow DOM.
- **Login triggers device verification** — every headless Chromium session is an "unrecognized device."
- **Rate limits are real** — 5,000 requests/hour sounds generous until you're seeding and cleaning up 50 tests.

Those aren't bugs. Those are the curriculum.

---

## The stack

- **Playwright** — browser automation, API testing, and visual comparisons in one tool.
- **TypeScript** — typed API clients, typed fixtures, no guessing what a response shape is.
- **playwright-bdd** — Gherkin syntax without Cucumber.js's baggage. Fixtures flow into step definitions natively.
- **No Axios, no node-fetch** — Playwright's built-in `request` fixture handles all API calls. Same context as the browser.

---

## The architecture

### The sandbox pattern

Creating and destroying a project per test run is slow, rate-limited, and flaky. Instead:

- **One kanban board** lives permanently (created once in GitHub UI).
- **Each test seeds** its own issues with unique timestamped names (`e2e-1715000000-a7f2`).
- **Each test cleans up** what it created — remove from board, close the issue.
- **Parallel tests never collide** because every seeded resource has a unique ID.

This is the persistent sandbox pattern. It's not flashy, but it eliminates the #1 source of flakiness in API-dependent tests: shared mutable state.

### Two API clients (no extra deps)

GitHub splits its API surface. Issues, labels, comments, milestones? **REST**. Project boards, kanban columns, custom fields, item status? **GraphQL only.**

So we have two clients, both using Playwright's built-in `request` fixture:

**REST** — `GitHubAPI`:

```typescript
async createIssue(repo: string, params: CreateIssueParams): Promise<GitHubIssue> {
  const response = await this.request.post(
    `${this.baseUrl}/repos/${repo}/issues`,
    { headers: this.authHeaders(), data: params }
  );
  return response.json();
}
```

**GraphQL** — `GitHubProjectsAPI`:

```typescript
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
```

Same `request` context. Same auth header. Zero extra dependencies. If you can make a REST call in Playwright, you can make a GraphQL call — it's just a POST with a different body shape.

### Fixture layering (no BaseTest class)

Instead of a `BaseTest` with `beforeEach/afterEach`, fixtures compose from the bottom up:

```
dataManager          ← cleanup queue, always the bottom layer
  ├── githubAPI      ← REST client (issues, labels, comments)
  ├── projectsAPI    ← GraphQL client (boards, items, fields)
  │     └── sandbox           ← resolved project context (projectId, status field IDs)
  │           └── seededProjectIssue  ← creates issue → adds to board → enqueues cleanup
```

Each fixture declares what it depends on. TypeScript enforces it. And — critically — **teardown runs even if the test fails.**

```typescript
dataManager: async ({}, use) => {
  const dm = new DataManager();
  await use(dm);           // ← test runs here (or fails here)
  await dm.cleanupAll();   // ← ALWAYS executes. Guaranteed.
},
```

No try/catch. No `afterEach` that might be skipped. The `use()` boundary is the contract — everything after it is teardown, and Playwright guarantees it runs regardless of what happened above.

### DataManager — LIFO cleanup queue

Every test that creates resources enqueues a cleanup function. The DataManager runs them in reverse order (last created = first cleaned), and one failed cleanup doesn't block the rest:

```typescript
async cleanupAll(): Promise<void> {
  const errors: Error[] = [];
  for (const fn of this.cleanupQueue.reverse()) {
    try { await fn(); } catch (error) { errors.push(error as Error); }
  }
  if (errors.length > 0) {
    console.warn(`DataManager: ${errors.length} cleanup task(s) failed`);
  }
}
```

No test pollution. No orphaned issues. No "why is the board showing 50 stale cards?"

### Page objects — no CSS selectors

GitHub hashes its class names. `.d-sm-flex` today is `.xpc-8b2` tomorrow. So every locator is semantic:

```typescript
this.usernameInput = page.getByLabel('Username or email address');
this.passwordInput = page.getByLabel('Password');
this.signInButton = page.getByRole('button', { name: 'Sign in', exact: true });
this.errorMessage = page.getByRole('alert');
```

---

## What the site taught us (so far)

GitHub didn't roll over. Here's what broke during setup:

### Duplicate `role="alert"` elements

GitHub's login page has two elements with `role="alert"` — an empty WebAuthn span, then the real error `<div>`. `getByRole('alert')` fixed it — the accessibility tree filters out invisible elements that raw CSS selectors would match.

### Two "Sign in" buttons

`getByRole('button', { name: 'Sign in' })` matches both the submit input AND a passkey prompt button. `{ exact: true }` resolves it — the passkey button has a longer accessible name ("Sign in with a passkey").

### Shadow DOM in the kanban board

Project board items render inside web components. `document.querySelectorAll('button')` finds nothing. But `getByRole('button')` traverses shadow DOM via the accessibility tree — so it works.

### Headless Backlog view is broken

The Backlog tab renders column headings but **not the item cards** in headless Chromium. The Priority board tab does. Finding this took hours of debugging. A demo app would never have this problem — because demo apps don't use shadow DOM.

---

## What's next

The foundation is built: architecture, API clients, data lifecycle, login flow. The real work — automating 37 scenarios across 16 areas — starts now.

- Issue CRUD (create, update, close, reopen)
- Labels & metadata (add, remove, filter)
- Milestones, assignees, board workflow
- Table views, comments, bulk operations
- Custom fields, draft items, archive
- Auto-workflows, saved views, ranking

Each one will surface new constraints. Rate limits will trigger. Auth will expire. APIs will return errors the docs don't mention. And every constraint is a lesson in testing real systems — not toy ones.

---

_Part 1 of a series on real-website E2E testing with Playwright. Part 2: ["Why I Dropped BaseTest for Fixtures"](/fixtures-over-basetest). Part 4: ["Authentication Without the 2FA Nightmare"](/blog/04-authentication-without-2fa)._
