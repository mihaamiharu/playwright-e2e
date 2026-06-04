# Advanced E2E Improvements Plan

This document outlines the roadmap for elevating the `playwright-e2e` framework from a standard implementation to a "Senior-Level" production-grade architecture. These improvements focus on **Resiliency**, **Contract Safety**, **Observability**, and **Developer Experience (DX)**.

---

## 1. API Contract Validation (Zod)

### Why it's Senior-Level

Standard E2E tests often fail with vague UI errors when an underlying API changes. By implementing runtime schema validation, we catch "Contract Breaks" at the source (the Data Layer) before they manifest as brittle UI failures.

### Implementation Strategy

1. **Define Schemas:** Create Zod schemas for all GitHub REST/GraphQL entities in `src/utils/api/schemas.ts`.
2. **Strict Parsing:** Update `GitHubAPI` methods to parse raw JSON responses through these schemas.
3. **Handle Optionality:** Use Zod's `.nullable()` and `.optional()` to handle the inherent messiness of real-world production APIs.

### Example

```typescript
import { z } from 'zod';

export const GitHubIssueSchema = z.object({
  number: z.number(),
  node_id: z.string(),
  html_url: z.string().url(),
  title: z.string(),
  state: z.enum(['open', 'closed']),
});

// Inside GitHubAPI.ts
async getIssue(repo: string, issueNumber: number) {
  const response = await this.request.get(...);
  const data = await response.json();
  return GitHubIssueSchema.parse(data); // Fails fast with descriptive error if schema mismatches
}
```

---

## 2. Network Interception & Resiliency Testing

### Why it's Senior-Level

Production environments are not always stable. A senior-grade suite tests how the application handles failures (500 errors, timeouts, rate limits) without needing to actually break the production server.

### Implementation Strategy

1. **Mock Failures:** Utilize Playwright’s `page.route()` to intercept specific API calls.
2. **Edge Case Scenarios:** Create a "Resiliency" feature suite to verify that the UI displays appropriate error toasts or fallback states.

### Example

```typescript
// steps/github/resiliency.steps.ts
Given('the GitHub API is failing with a 500 error', async ({ page }) => {
  await page.route('**/repos/**/issues', async (route) => {
    await route.fulfill({
      status: 500,
      body: JSON.stringify({ message: 'Internal Server Error' }),
    });
  });
});
```

---

## 3. Enhanced Trace Annotations & Steps

### Why it's Senior-Level

Standard traces show _what_ happened, but high-signal traces show _why_. By wrapping technical setup in `test.step()` and adding metadata via `annotations`, we make the Playwright Trace Viewer a powerful debugging tool for the whole team.

### Implementation Strategy

1. **Logical Grouping:** Wrap all JIT/API data setup in `test.step()` with descriptive labels.
2. **Metadata Injection:** Use `test.info().annotations` to link to created issues, PRs, or external logs directly within the trace.

### Example

```typescript
async createIssue(repo: string, params: CreateIssueParams) {
  return await test.step(`Setup: Create Issue "${params.title}" via REST API`, async () => {
    const data = await this.request.post(...).then(r => r.json());

    test.info().annotations.push({
      type: 'Resource Link',
      description: `Issue #${data.number}: ${data.html_url}`
    });

    return data;
  });
}
```

---

## 4. CI Observability & PR Feedback

### Why it's Senior-Level

E2E testing is a feedback loop. A framework that communicates its results clearly to the team (via PR comments or job summaries) has higher "Developer Experience" (DX) value than one that just stays green or red.

### Implementation Strategy

1. **GitHub Job Summaries:** Use `$GITHUB_STEP_SUMMARY` to write a formatted markdown report after every run.
2. **PR Comments:** (Optional) Implement an action to comment on PRs with a summary of passed/failed tests and direct links to sharded traces.

### Example (CI Workflow)

```yaml
- name: Publish Test Summary
  if: always()
  run: |
    echo "### 🎭 Playwright Results" >> $GITHUB_STEP_SUMMARY
    echo "- **Total Tests:** $(jq '.stats.expected + .stats.unexpected' reports/results.json)" >> $GITHUB_STEP_SUMMARY
    echo "- **Failed:** $(jq '.stats.unexpected' reports/results.json)" >> $GITHUB_STEP_SUMMARY
    echo "[View Full Allure Report](https://your-pages-link.io)" >> $GITHUB_STEP_SUMMARY
```

---

## 5. Execution Performance & Sharding

### Why it's Senior-Level

A suite that takes 30 minutes to run rarely gets run. By planning for sharding early and tracking slow tests, the framework scales gracefully as feature coverage grows without sacrificing feedback speed.

### Current State

- `fullyParallel: false` — tests run serially per worker
- `workers: process.env.CI ? 2 : undefined` — minimal parallelism in CI
- Serial execution is required because `seededProjectIssue` creates data in a shared project sandbox; multiple workers would conflict on the same project view

### Sharding Strategy (CI Matrix)

Split the suite by domain tag. Each shard runs independently with its own tag filter and sandbox isolation:

```yaml
strategy:
  fail-fast: false
  matrix:
    shard:
      - tag: '@crud or @board or @comments'
        label: core-flow
      - tag: '@labels or @assignees or @milestones'
        label: metadata
      - tag: '@table-views or @saved-views or @search or @ranking'
        label: views
      - tag: '@custom-fields or @auto-workflows or @archive'
        label: advanced
      - tag: '@draft-items or @bulk-operations or @date-iteration'
        label: data-lifecycle
      - tag: '@a11y'
        label: accessibility
```

Each shard runs:

```bash
npm test -- --grep "$SHARD_TAG"
```

Tests within each shard remain serial (tag isolation prevents shared-resource conflicts between shards). The `fail-fast: false` ensures one slow/flaky shard doesn't abort others.

### When to Enable `fullyParallel`

Blocked by the shared sandbox dependency. Once per-worker sandbox isolation is implemented (each worker creates its own project), `fullyParallel: true` becomes safe. This is future work.

### Slow Test Detection

Add to CI to flag duration regressions:

```yaml
- name: Track slow tests
  if: always()
  run: |
    jq 'select(.duration > 15000) | "\(.title) — \(.duration)ms"' \
      reports/artifacts/.last-run.json > slow-tests.txt 2>/dev/null || true
    if [[ -s slow-tests.txt ]]; then
      echo "### Slow Tests (>15s)" >> $GITHUB_STEP_SUMMARY
      cat slow-tests.txt >> $GITHUB_STEP_SUMMARY
    fi
```

---

## Success Metrics

- **Mean Time to Recovery (MTTR):** Reduction in time spent debugging failures due to clearer traces and contract validation.
- **Suite Reliability:** Reduced flakiness by explicitly testing error-handling logic via network interception.
- **DX Satisfaction:** Positive feedback from developers on the clarity of CI summaries.
- **Suite Throughput:** Sharded runs complete in under 10 minutes (vs single-serial runs).
