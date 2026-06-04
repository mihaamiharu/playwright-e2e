# Implementation Plan

Enhancing the `playwright-e2e` framework with API contract validation, trace annotations, data factories, and sharding guidance.

---

## Execution Order

| Phase | Area                          | Risk   | Dependencies           |
| ----- | ----------------------------- | ------ | ---------------------- |
| 1     | Test Data Factories           | Low    | None                   |
| 2     | API Contract Validation (Zod) | Medium | None (parallel with 1) |
| 3     | Trace Annotations & Steps     | Medium | Builds on 1 + 2        |
| 4     | Execution Performance         | None   | Documentation only     |

---

## Phase 1: Test Data Factories

**Goal:** Replace 16 scattered `Date.now() + Math.random()` + inline object literal patterns with a single source of truth.

### New file: `src/utils/testing/factories.ts`

Functions:

- `uniqueId(prefix)` — internal, generates collision-free IDs with monotonic counter
- `createTestIssueTitle(label)` — generates `e2e-{label}-{ts}-{counter}-{random}` for `scenarioContext` storage before issue creation
- `createTestIssue(overrides?)` — returns `CreateIssueParams` with auto-generated title/body, accepts partial overrides
- `createTestMilestone(overrides?)` — returns milestone params with auto-generated title and default 7-day `due_on`
- `createTestComment(body?)` — returns comment body string

### Affected files

Every step file that constructs inline data objects. Pattern change:

```typescript
// Before (16+ occurrences)
const uniqueId = `bulk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const issue = await githubAPI.createIssue(testRepo, {
  title: `e2e-${uniqueId}`,
  body: 'Bulk test issue',
});

// After
import { createTestIssue } from '../../src/utils/testing/factories';
const issue = await githubAPI.createIssue(testRepo, createTestIssue({ body: 'Bulk test issue' }));
```

Files to update: `steps/github/{search,bulk-operations,milestones,labels,ranking,draft-items,assignees,comments,custom-fields,date-iteration,table-views,auto-workflows}.steps.ts` + `src/fixtures/index.ts`.

---

## Phase 2: API Contract Validation (Zod)

### Step 2a: Add dependency

```bash
npm install zod
```

### Step 2b: Schema files

- `src/utils/api/schemas/rest.ts` — REST response shapes + input param schemas
- `src/utils/api/schemas/graphql.ts` — GraphQL entity schemas
- `src/utils/api/schemas/index.ts` — barrel re-export

Design decisions:

- **`.passthrough()`** on all schemas — GitHub adds fields; unknown keys must not break validation
- **`.nullable()`** on fields that can be null in the GitHub API (e.g., `body`, `due_on`)
- **`.optional()`** on fields that may be absent (e.g., `description` on labels, `options` on fields)
- **`.parse()` (fail-fast)** — schema mismatch throws immediately; no lenient mode

### Step 2c: Integrate into both API clients

In `github-rest.ts`, every `response.json()` becomes:

```typescript
const raw = await response.json();
return GitHubIssueSchema.parse(raw);
```

Input validation at method entry:

```typescript
async createIssue(repo: string, params: CreateIssueParams) {
  const valid = CreateIssueParamsSchema.parse(params); // guards bad test data
  // ...
}
```

In `github-graphql.ts`, data extraction points get parsed:

```typescript
const rawItems = data.node?.items?.nodes ?? [];
return z.array(ProjectItemSchema).parse(rawItems);
```

### Step 2d: Replace TS interfaces with Zod inferred types

```typescript
export type GitHubIssue = z.infer<typeof GitHubIssueSchema>;
```

Single source of truth eliminates drift between static types and runtime validation.

---

## Phase 3: Trace Annotations & Steps

### Architectural note

`import { test } from '@playwright/test'` is a singleton — both `test.step()` and `test.info()` work from any module executing within a test context. No fixture threading needed.

### Step 3a: Wrap API methods in `test.step()`

Both `github-rest.ts` and `github-graphql.ts` get:

```typescript
import { test, type APIRequestContext } from '@playwright/test';
```

Step naming convention: `{Layer} {Action}: {details}`

- `GitHub REST: create issue "{title}"`
- `GitHub REST: close issue #{number}`
- `GitHub GraphQL: add issue to project`
- `GitHub GraphQL: move item to status "{status}"`

### Step 3b: Resource link annotations

On every **create** method, push an annotation:

```typescript
test.info().annotations.push({
  type: 'Resource Link',
  description: `Issue #${issue.number}: ${issue.html_url}`,
});
```

### Step 3c: Attach JSON payloads

On every **create-like** method:

```typescript
test.info().attach('api-response', {
  body: JSON.stringify(issue, null, 2),
  contentType: 'application/json',
});
```

### Step 3d: Wrap framework-level operations

- `DataManager.cleanupAll()` in `project-data.fixture.ts` → `test.step('DataManager: LIFO cleanup', ...)`
- `seededProjectIssue` fixture in `src/fixtures/index.ts` → `test.step('Fixture: seed project issue', ...)`

### Trace Viewer outcome

```
Test: BRD-01 Move forward through statuses
├── Fixture: seed project issue          ← new
│   ├── GitHub REST: create issue "..."  ← new
│   ├── GitHub GraphQL: add issue to...  ← new
│   └── GitHub GraphQL: move item to...  ← new
├── Given a seeded project issue...      ← existing BDD
├── When I move the issue to "In Progress"
├── Then the issue shows in "In Progress"
└── DataManager: LIFO cleanup           ← new
    ├── GitHub GraphQL: remove item...   ← new
    └── GitHub REST: close issue #42     ← new
```

---

## Phase 4: Execution Performance

### Update `docs/IMPROVEMENT-PLAN.md` with sharding strategy

Document a CI matrix that splits the suite by domain tag:

```yaml
strategy:
  matrix:
    shard:
      - tag: '@crud or @board or @comments'
      - tag: '@labels or @assignees or @milestones'
      - tag: '@table-views or @saved-views or @search or @ranking'
      - tag: '@custom-fields or @auto-workflows or @archive'
      - tag: '@draft-items or @bulk-operations or @date-iteration'
      - tag: '@a11y'
```

Each shard runs `npm test -- --grep "$SHARD_TAG"` in parallel. Tests within each shard remain serial (tag isolation prevents shared-resource conflicts).

### Document `fullyParallel` blockers

Current blockers: `seededProjectIssue` creates data in a shared project sandbox; multiple workers would conflict. Solution: sandbox-per-worker as future work.

### Document duration tracking

Add slow test detection to CI via `.last-run.json` parsing.

---

## Risks

| Risk                                      | Impact                        | Mitigation                                                           |
| ----------------------------------------- | ----------------------------- | -------------------------------------------------------------------- |
| Zod schemas miss optional/null fields     | Tests fail on valid responses | `.passthrough()` + `.nullable()` aggressively; test against live API |
| `test.step()` overhead                    | Minor (~1-3ms per step)       | Only wrap API calls and setup, not UI interactions                   |
| Factory title format mismatch             | Assertion failures            | `createTestIssueTitle()` preserves `e2e-{label}-{ts}` format         |
| `test.info()` called outside test context | Crash                         | Only called inside method bodies, never at module level              |
