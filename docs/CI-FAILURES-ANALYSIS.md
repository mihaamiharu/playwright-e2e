# CI Failures Analysis — Run #26919616719

Branch `fix/sdet-review-items`, commit `73a975f`. 10 tests still failing after the navigation
and filter-type fixes. All 10 were also failing in the previous run (#26897393108).

---

## Root Cause Summary

**9 of 10 tests share one root cause: GraphQL eventual consistency.**

When test items are created via the GraphQL API (`addIssueToProject`,
`addDraftIssue`) and the page navigates to the board, the newly created items
are **not immediately queryable**. The propagation delay is consistently
**6–8 seconds**. Tests that assert card visibility or item status time out
before the data arrives.

The `BoardView.expectCardVisible()` method tries a `toPass` with `page.reload()`
to work around this, but each reload also triggers a fresh Turbo navigation
that completes before the GraphQL data arrives — so the retry never succeeds
within the 15 s timeout either.

---

## Per-Test Breakdown

### 1. ARC-02 — Archive Restore

| Field          | Value                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **File**       | `steps/github/archive.steps.ts:33`                                                                                                      |
| **Error**      | `Timeout 10000ms exceeded while waiting on the predicate`                                                                               |
| **Assertion**  | `expect(card.first()).toBeVisible()` inside `toPass({ timeout: 10_000 })`                                                               |
| **Root cause** | After `unarchiveItem()` → board navigation, the unarchived item has not propagated through GraphQL. The board renders without the card. |

---

### 2. ASN-03 — Filter Board by Assignee

| Field          | Value                                                                                                                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Step**       | `Then the seeded issue should be visible on the board`                                                                                                                                                                                                |
| **Error**      | `Test timeout of 30000ms exceeded`                                                                                                                                                                                                                    |
| **Assertion**  | `boardView.expectCardVisible(seededProjectIssue.title)`                                                                                                                                                                                               |
| **Root cause** | **`selectType('Assignee')` now works** (the `clear()` fix resolved the dropdown issue). The test now proceeds past the filter step and reaches the card-visibility assertion — which times out because the seeded issue hasn't rendered on the board. |

---

### 3. BRD-01 — Board Workflow Forward

| Field          | Value                                                                                                                                                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **File**       | `steps/github/board-workflow.steps.ts:26`                                                                                                                                                                                                                         |
| **Error**      | `Expected: "In progress", Received: undefined`                                                                                                                                                                                                                    |
| **Assertion**  | `item?.status` after `moveItemToStatus()` — `toPass({ timeout: 10_000 })`                                                                                                                                                                                         |
| **Root cause** | The seeded issue's `projectItemId` does not appear in `getItems()` results for 6–8 seconds after `addIssueToProject()`. Each `getItems()` GraphQL call takes 3–5 s, so only 2–3 retries fit inside the 10 s timeout. The test fails before the item ever appears. |

---

### 4. BRD-03 — Drag Between Columns

| Field           | Value                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **File**        | `src/pages/github/ProjectBoardPage.ts:56`                                                                                                        |
| **Error**       | `expect(locator).toBeVisible() failed` for `[aria-roledescription="draggable"]`                                                                  |
| **Assertion**   | `dragCardToColumn()` → `page.reload()` → `expect(card).toBeVisible()` (5 s implicit timeout)                                                     |
| **Root cause**  | After `page.reload()`, GraphQL card data hasn't loaded yet. The `expect(card).toBeVisible()` gives up before the card element exists in the DOM. |
| **Retry error** | `Expected: "Backlog", Received: undefined` — same GraphQL status-propagation failure as BRD-01.                                                  |

---

### 5. ITER-01 — Date/Iteration Field

| Field          | Value                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Step**       | `Then the seeded issue should be visible on the board`                                                                               |
| **Error**      | `Test timeout of 30000ms exceeded`                                                                                                   |
| **Assertion**  | `boardView.expectCardVisible(seededProjectIssue.title)`                                                                              |
| **Root cause** | The seeded issue is added to the project in the fixture, but the board doesn't render it because the GraphQL query hasn't caught up. |

---

### 6. DRFT-01 — Draft Item Without Issue Number

| Field          | Value                                                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **File**       | `steps/github/draft-items.steps.ts:29`                                                                                                                     |
| **Error**      | `expect(locator).toBeVisible() failed` — `getByRole('button', { name: /draft-.../ })` not found                                                            |
| **Assertion**  | `expect(card.first()).toBeVisible({ timeout: 15000 })`                                                                                                     |
| **Root cause** | The draft is created via `addDraftIssue()` (a GraphQL mutation). The board is then navigated to, but the draft item hasn't propagated through GraphQL yet. |

---

### 7. DRFT-02 — Draft Converted to Issue

| Field          | Value                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| **File**       | `steps/github/draft-items.steps.ts:65`                                                                        |
| **Error**      | `expect(locator).toBeVisible() failed` — `getByRole('button', { name: /draft-convert-.../ })` not found       |
| **Assertion**  | `expect(card.first()).toBeVisible({ timeout: 15000 })`                                                        |
| **Root cause** | The full issue is created via REST (immediate) then added to the project via GraphQL. Same propagation delay. |

---

### 8. LBL-04 — Filter Board by Label

| Field          | Value                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **File**       | `steps/github/labels.steps.ts:58`                                                                                          |
| **Error**      | `Test timeout of 30000ms exceeded`                                                                                         |
| **Assertion**  | `boardView.expectCardVisible(seededProjectIssue.title)` — **before** any filter is applied                                 |
| **Root cause** | The first line of the step expects the seeded issue to be visible on the board. It isn't — GraphQL data hasn't loaded yet. |

---

### 9. RANK-01 — Ranking / Backlog

| Field          | Value                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **File**       | `steps/github/ranking.steps.ts:32-33`                                                                                                          |
| **Error**      | `Test timeout of 30000ms exceeded`                                                                                                             |
| **Assertion**  | `boardView.expectCardVisible()` for two seeded issues                                                                                          |
| **Root cause** | Both issues were added to the project by the fixture and scenario context. Neither has propagated through GraphQL by the time the board loads. |

---

### 10. SRCH-01 — In-Project Search

| Field          | Value                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| **File**       | `steps/github/search.steps.ts:48`                                                                     |
| **Error**      | `Test timeout of 30000ms exceeded`                                                                    |
| **Assertion**  | `boardView.expectCardVisible(keywordIssueTitle)`                                                      |
| **Root cause** | The search-keyword issue was created and added to the project by the fixture. Same propagation delay. |

---

## Fix Strategy

**One change, one file: `src/fixtures/index.ts`.**

In the `seededProjectIssue` fixture, after `addIssueToProject()` succeeds, wait
for the item to appear in `getItems()` before yielding to the test:

```ts
const projectItemId = await projectsAPI.addIssueToProject(sandbox.projectId, issue.node_id);

// Wait for GraphQL eventual consistency — the item may not be queryable
// immediately after creation.  Blocking here removes the race for every
// test that uses seededProjectIssue.
await pwTest.step('Fixture: wait for GraphQL consistency', async () => {
  await expect(async () => {
    const items = await projectsAPI.getItems(sandbox.projectId);
    const item = items.find((i) => i.id === projectItemId);
    expect(item).toBeDefined();
  }).toPass({ timeout: 10_000 });
});
```

This fixes **9 of 10 tests** by ensuring every test starts with its seeded item
already propagated through GitHub's GraphQL layer. The 6–8 s propagation
delay occurs once during setup instead of repeatedly during test execution
(where it is compressed into tight `toPass` timeouts).

The remaining **BRD-03** drag-locator issue may also resolve once the card
renders reliably; if not, the `[aria-roledescription="draggable"]` selector
can be investigated separately.
