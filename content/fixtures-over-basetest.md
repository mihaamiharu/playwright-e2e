# Why I Dropped BaseTest for Fixtures — And Why Playwright Recommends It Too

A deep dive into fixture-based test architecture vs the traditional BaseTest pattern, with real examples from testing GitHub's API.

---

## The moment BaseTest broke

I was building a Playwright E2E suite against real GitHub — issues, kanban boards, labels, the works. My first instinct was what every QA engineer reaches for:

```typescript
abstract class BaseTest {
  protected page: Page;
  protected api: GitHubAPI;

  async before() {
    this.page = await context.newPage();
    this.api = new GitHubAPI(request, token);
    // Connect to sandbox project, resolve fields, seed data...
  }

  async after() {
    await this.api.cleanup();
    await this.page.close();
  }
}
```

Looked clean. Then the sandbox project token expired mid-suite.

`before()` threw on test #12. `after()` never ran for tests #1–11 because their teardown was coupled to the same `before/after` pair on a **different** test instance. But the real problem? The 11 tests that *did* pass left their seeded issues on GitHub's kanban board because I was managing cleanup manually in a catch block that I wrote wrong.

That was the moment I ripped it out.

---

## What Playwright says

Before I show the fix, here's what the official Playwright docs say:

> *"We recommend fixtures over beforeAll/afterAll hooks. Fixtures encapsulate setup and teardown in the same place — they are composable, and they are reusable."*

And more bluntly:

> *"Don't use BaseTest classes. Use fixtures instead."*

Fixtures aren't a niche pattern. They're **the** recommended way to structure Playwright tests. Here's why — with real code from my suite.

---

## The BaseTest trap: 5 things that broke

### 1. Teardown is a maybe, not a guarantee

```typescript
class BaseTest {
  async before() {
    await seedData();     // ← throws? after() never runs
  }
  async after() {
    await cleanup();      // ← dead code if before() failed
  }
}
```

If `before()` fails, `after()` is skipped. That means:
- The browser page leaks (memory in CI)
- Any data that was partially seeded stays on the remote system
- You don't know what state the next test inherits

**Fixture fix:**

```typescript
seededIssue: async ({ api, dm }, use) => {
  const issue = await api.createIssue(repo, { title: `e2e-${Date.now()}` });
  dm.enqueue(() => api.closeIssue(repo, issue.number));
  await use(issue);        // ← test runs here. If this throws:
  await dm.cleanupAll();   // ← STILL executes. Always.
},
```

`use()` is the boundary. Everything after it is teardown — and Playwright guarantees it runs even if the test or any dependent fixture throws. It's scope-based, not try/catch-based.

---

### 2. You pay for what you don't use

Every test that extends `BaseTest` gets the full buffet — API client, sandbox resolution, GraphQL field queries, everything — even if the test just validates a login button:

```typescript
class LoginUITest extends BaseTest {
  async test() {
    // I only need this.page
    // But I got: api, projectsApi, sandbox, seededIssue, dataManager
    // Cost: 3 extra GraphQL calls, token validation, field ID resolution
  }
}
```

In a 100-test suite where 30% are simple UI validations, that's hundreds of wasted API calls.

**Fixture fix:**

```typescript
// ✅ Only what's declared resolves. Nothing else.
test('login button exists', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});
```

No API token. No GraphQL. No sandbox. The test runs in under a second.

---

### 3. Worker reuse is manual (and brittle)

Some fixtures are stateless — an API client is just a wrapper around `request`. Creating it fresh per test wastes init time.

With BaseTest, you'd make it a `static` field:

```typescript
class BaseTest {
  static api: GitHubAPI;  // Shared across tests?
  // What about parallel workers? Threading? Token expiry?
}
```

**Fixture fix:** Playwright auto-scopes for you.

| Fixture | Scope | Why |
|---------|-------|-----|
| `dataManager` | Per test | Must be fresh — each test needs its own cleanup queue |
| `githubAPI` | Per worker | Stateless — one instance serves all tests on that worker |
| `projectsAPI` | Per worker | Same reason — just wraps `request` |
| `sandbox` | Per test | Field IDs can change between runs |
| `seededProjectIssue` | Per test | Must be unique per test |

No `static` management. No scope annotations. You just declare dependencies in the fixture factory, and Playwright determines the optimal lifetime.

---

### 4. Inheritance kills composition

What happens when you need different "shapes" of test?

```typescript
// BaseTest flat hierarchy
class BaseTest {}          // Everything
class LoginTest extends BaseTest {}    // Gets sandbox (don't want)
class LabelTest extends BaseTest {}    // Gets comments API (don't need)
class BoardTest extends BaseTest {}    // Gets login page (irrelevant)
```

You can't opt out of what you inherit. The only fix is multiple abstract base classes — which explodes into a class hierarchy nobody wants to maintain.

**Fixture fix:** Compose from the bottom up.

```typescript
// Start minimal
const minimal = base.extend<{ dm: DataManager }>({
  dm: async ({}, use) => { /* ... */ },
});

// Add REST API
const withAPI = minimal.extend<{ api: GitHubAPI }>({
  api: async ({ request }, use) => { /* ... */ },
});

// Add GraphQL + sandbox
const withSandbox = withAPI.extend<{ sandbox: SandboxContext }>({
  sandbox: async ({ request }, use) => { /* ... */ },
});

// Add seeded data
const full = withSandbox.extend<{ seededIssue: GitHubIssue }>({
  seededIssue: async ({ api, sandbox, dm }, use) => { /* ... */ },
});

export { minimal, withAPI, withSandbox, full };
```

Four test instances in one file. Each test picks the one it needs. No class explosion, no dead inheritance.

---

### 5. TypeScript can't see BaseTest's state

```typescript
class BaseTest {
  protected api?: GitHubAPI;     // Optional — might not be initialized
  protected sandbox?: Sandbox;   // Undefined until before() runs
}

class MyTest extends BaseTest {
  async test() {
    this.api.createIssue(...)     // TS: "Object is possibly undefined"
    // Did before() run? Did it fail halfway? Who knows.
  }
}
```

**Fixture fix:**

```typescript
test('create issue', async ({ githubAPI, dataManager }) => {
  githubAPI.createIssue(...)   // ✅ TypeScript knows this exists and is typed
  // projectsAPI is not in scope — TS won't even let you reference it
});
```

The type system becomes your test's contract. You can't use a fixture you didn't declare. You can't call something that might be undefined. Autocomplete works on every parameter.

---

## Head-to-head

| Concern | BaseTest | Fixtures |
|---------|----------|----------|
| Teardown after failure | ❌ Only if `before()` completed | ✅ Guaranteed by `use()` |
| Lazy loading | ❌ Everything in hooks | ✅ Only declared fixtures |
| Worker reuse | ❌ Manual `static` management | ✅ Auto-scoped |
| Composition | ❌ Single inheritance chain | ✅ Multiple `.extend()` chains |
| Type safety | ❌ `this.property` — possibly undefined | ✅ Parameter types — always defined |
| Parallel safety | ⚠️ Shared mutable `this` | ✅ Isolated per worker |
| Official recommendation | ❌ Explicitly discouraged | ✅ Recommended |

---

## When BaseTest is still fine

I'm not saying BaseTest is always wrong. It's fine when:

- Your suite has < 20 tests
- No API calls in setup (pure UI)
- Every test uses exactly the same resources
- You're not running in parallel

If all four conditions are true, BaseTest works. The moment one breaks — you have 50 tests, you hit an API, you need parallel execution, or different tests need different resources — fixtures stop being a "nice to have" and become a necessity.

---

## What I'd tell my past self

Don't start with BaseTest "because it's familiar." Fixtures are not harder — they're just different. The first time a test fails and your cleanup still runs, you'll never go back.

And when someone on your team asks "why not just use a base class?", you can point them to the Playwright docs. The team that built the tool says fixtures. That's good enough for me.

---

*Part 2 of the Playwright E2E architecture series. Part 1: [Inside a Production-Grade Playwright E2E Repo](/architecture-tour). Part 4: ["Authentication Without the 2FA Nightmare"](/blog/04-authentication-without-2fa).*
