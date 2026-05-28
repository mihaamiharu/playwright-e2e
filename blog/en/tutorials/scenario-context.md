# The Missing Piece in Playwright BDD: A Scenario-Wide Context Object

When Cucumber frameworks talk to Playwright, one feature gets lost in translation — and it took me 11 step files of module-level `let` variables to realize it.

---

## The problem: where does state live between steps?

Playwright BDD bridges Gherkin syntax with Playwright's fixture system. Fixtures handle the heavy lifting — `seededProjectIssue` carries issue numbers, titles, and project IDs across every step in a test. That's tier one. Type-safe, traceable, auto-cleaned.

But what about the _other_ stuff?

```typescript
// milestones.steps.ts — before
let milestoneNumber = 0;
let milestoneTitle = '';
let secondMilestoneIssueNumber = 0;

When('I create a milestone...', async ({ githubAPI, dataManager }) => {
  const milestone = await githubAPI.createMilestone(/* ... */);
  milestoneNumber = milestone.number; // stores in module-level variable
  milestoneTitle = milestone.title;
});

When('I link the seeded issue to the milestone...', async ({ githubAPI, seededProjectIssue }) => {
  await githubAPI.updateIssue(repo, seededProjectIssue.number, {
    milestone: milestoneNumber, // reads from module-level variable
  });
});

Then('I should see the milestone name...', async ({ issuePage }) => {
  await issuePage.expectMilestone(milestoneTitle); // reads from module-level variable
});
```

It works. `fullyParallel: false` keeps tests serial, so values never bleed between concurrent scenarios. The next scenario reassigns `milestoneNumber` before anyone reads it. You close your eyes, ship it, and move on.

But it's fragile. Every variable depends on:

- Serial execution (blocking parallel runs)
- Implicit ordering (step A must run before step B reads the value)
- Human memory (did I reset that variable between scenarios?)

And it's everywhere. Eleven step files. Twenty module-level variables. `milestoneNumber`, `commentId`, `searchKeyword`, `secondIssueProjectItemId`, `issueATitle`, `issueBTitle` — a scattered constellation of global mutable state.

---

## What the rest of the BDD world does

This isn't a new problem. Every BDD framework ships a solution:

| Framework           | Mechanism                 | How it works                                                                                              |
| ------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Cucumber.js**     | `World`                   | Every scenario gets a fresh World instance. Steps access `this` — which is the World.                     |
| **Python Behave**   | `context`                 | A `Context` object is passed to every step. Set `context.order_id = 42` in one step, read it in the next. |
| **SpecFlow (.NET)** | `ScenarioContext`         | Key-value dictionary scoped to the scenario. `ScenarioContext.Current["key"] = value`.                    |
| **Cucumber JVM**    | PicoContainer / Spring DI | Inject shared state objects between step classes. Type-safe but more ceremony.                            |

The pattern is always the same: **a key-value store scoped to a single scenario, injected into every step.** It's the escape hatch for ad-hoc state that doesn't deserve a full fixture.

Playwright BDD doesn't ship one. It expects you to either:

1. Model everything as fixtures (type-safe, but heavyweight for one-off values)
2. Roll your own (which is what the `let` variables were doing — poorly)

---

## The fix: `ScenarioContext`

A `Map<string, unknown>` wrapper, nothing more:

```typescript
// src/utils/scenario-context.ts
export class ScenarioContext {
  private store = new Map<string, unknown>();

  set<T>(key: string, value: T): void {
    this.store.set(key, value);
  }

  get<T>(key: string): T {
    if (!this.store.has(key)) {
      throw new Error(`ScenarioContext: key "${key}" not found`);
    }
    return this.store.get(key) as T;
  }

  tryGet<T>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }
}
```

Wired as a fixture — same pattern as `DataManager`:

```typescript
// src/fixtures/github-project.fixture.ts
scenarioContext: async ({}, use) => {
  await use(new ScenarioContext());
};
```

A fresh instance per test. No reset logic (GC handles it). No cleanup. No concurrency issues — Playwright's worker isolation guarantees it.

---

## Before and after

**Before:** global mutable state scattered across 11 files.

```typescript
// milestones.steps.ts
let milestoneNumber = 0;
let milestoneTitle = '';
let secondMilestoneIssueNumber = 0;

When('I create a milestone...', async ({ githubAPI, dataManager }) => {
  const milestone = await githubAPI.createMilestone(/* ... */);
  milestoneNumber = milestone.number;
  milestoneTitle = milestone.title;
  // ...
});

When('I link the seeded issue to the milestone...', async ({ githubAPI, seededProjectIssue }) => {
  await githubAPI.updateIssue(repo, seededProjectIssue.number, {
    milestone: milestoneNumber, // where did this come from?
  });
});

Then('I should see the milestone name...', async ({ issuePage }) => {
  await issuePage.expectMilestone(milestoneTitle); // where did this come from?
});
```

**After:** same semantics, no globals.

```typescript
// milestones.steps.ts — zero module-level variables
When('I create a milestone...', async ({ githubAPI, dataManager, scenarioContext }) => {
  const milestone = await githubAPI.createMilestone(/* ... */);
  scenarioContext.set('milestoneNumber', milestone.number);
  scenarioContext.set('milestoneTitle', milestone.title);
  // ...
});

When(
  'I link the seeded issue to the milestone...',
  async ({ githubAPI, seededProjectIssue, scenarioContext }) => {
    await githubAPI.updateIssue(repo, seededProjectIssue.number, {
      milestone: scenarioContext.get<number>('milestoneNumber'),
    });
  },
);

Then('I should see the milestone name...', async ({ issuePage, scenarioContext }) => {
  await issuePage.expectMilestone(scenarioContext.get<string>('milestoneTitle'));
});
```

The step that **sets** the value declares `scenarioContext` in its params. The step that **reads** it does the same. You can trace data flow by following the key name. No implicit anything.

---

## The two-tier architecture

With `scenarioContext` in place, the architecture settles into two clean tiers:

| Tier                | Mechanism                                          | Use for                                                                                                     |
| ------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Fixtures**        | `seededProjectIssue`, `sandbox`, `githubAPI`       | Primary business entities. Typed, traceable, auto-cleaned. One `Cmd+Click` to the definition.               |
| **ScenarioContext** | `scenarioContext.set(key, value)` / `.get<T>(key)` | Ad-hoc state: milestone IDs, comment IDs, search keywords, second-issue titles. String keys, generic typed. |

Fixtures for what every test needs. Context for what _this_ test needs.

---

## What this isn't

It's not a replacement for typed fixtures. If your test suite has twenty scenarios creating milestones, `milestoneNumber` should graduate from `scenarioContext.set('milestoneNumber', ...)` into a `seededMilestone` fixture with its own cleanup logic.

It's also not a Cucumber `World` — there's no data table resolution, no YAML snapshot reset, no `{key}` interpolation in Gherkin strings. Playwright BDD doesn't support those patterns natively, and bolting them onto a fixture feels like fighting the tool.

It's the smallest possible abstraction that solves the problem. A per-test `Map` accessible from any step. That's it.

---

## The result

| Concern         | Before (`let` variables)                    | After (`ScenarioContext`)         |
| --------------- | ------------------------------------------- | --------------------------------- |
| Parallel safety | ❌ Depends on `fullyParallel: false`        | ✅ Worker-isolated                |
| State reset     | ❌ Implicit — next step reassigns           | ✅ Fresh `Map` per test           |
| Traceability    | ❌ Grep for variable name, hope it's unique | ✅ Key name traces across steps   |
| Test isolation  | ❌ Previous value leaks if step skipped     | ✅ Nothing persists               |
| Lines of code   | 0 (just the `let`s)                         | 22 (the class) + 1 line per usage |

Twenty-two lines of infrastructure code. Eleven files cleaned of global state. Tests that could run in parallel tomorrow if the cleanup strategy allows it.

---

_For the implementation, see `src/utils/scenario-context.ts` and the fixture definition in `src/fixtures/github-project.fixture.ts`._
