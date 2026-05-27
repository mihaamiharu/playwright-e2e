# When the DOM Fights Back: 4 Real-World E2E Gotchas from GitHub Projects

> **Part 7 of the Playwright E2E series.**
> [Part 1](/blog/01-why-real-websites.md) — Why real websites beat demo apps
> [Part 2](/architecture-tour) — Architecture of a production-grade E2E suite
> [Part 3](/fixtures-over-basetest) — Why fixtures over BaseTest
> [Part 4](/blog/04-authentication-without-2fa.md) — Authentication without the 2FA nightmare
> [Part 5](/blog/05-building-label-tests-with-ui-discovery.md) — Building E2E label tests with UI discovery
> [Part 6](/blog/06-assignees-milestones.md) — Assignees & Milestones: The Sidebar Pattern Pays Off

---

## The premise: 7 new scenarios, 4 new domains

After shipping labels, assignees, and milestones, Phase 4 of the test plan tackled **Views & Collaboration** — table layouts, comments, bulk operations, and in-project search:

| ID | Scenario |
|----|----------|
| TBL-01 | Switch to table view → verify columns render |
| TBL-02 | Sort table by a column → verify order changes |
| TBL-03 | Filter table by a field → verify matching rows |
| CMT-01 | Add comment via API → verify in timeline |
| CMT-02 | Edit comment via API → verify updated text |
| BULK-01 | Bulk update status via API → verify all changed |
| SRCH-01 | Search by keyword → verify matching results |

We had the full data lifecycle (seed → verify → cleanup), the API layer had `addComment()`/`updateComment()` ready, and the sandbox project was well-stocked with pre-existing data. We expected to write a few step definitions and be done in an hour.

Reality: 4 domain-specific landmines, each forcing a mid-implementation pivot.

---

## Gotcha 1: Substring matching in `getByRole` — "Unsaved" means "Save"

### The setup

After switching a project view from Board to Table layout, we applied a status filter:

```typescript
await page.getByRole('combobox', { name: 'Filter' }).click();
await page.getByRole('option', { name: 'Status, Filter' }).click();
await page.getByRole('option', { name: 'Backlog, Status' }).click();
await page.getByRole('button', { name: 'Save' }).click();
```

The error:

```
Error: strict mode violation: getByRole('button', { name: 'Save' }) resolved to 2 elements:
  1) <button>Save</button>
  2) <button>Unsaved changes View</button>
```

Wait — **"Unsaved changes View"** matched `{ name: 'Save' }`? Let's look closer:

```
"Unsave d changes View"
       ^^^^
```

Playwright's `getByRole(..., { name })` does **case-insensitive substring matching** by default. The string `"Unsaved"` contains `"save"` as a substring. So `{ name: 'Save' }` matches both the filter's Save button and the View menu's "Unsaved changes View" button.

### The fix

Add `exact: true` to constrain matching to the full accessible name:

```diff
- await page.getByRole('button', { name: 'Save' }).click();
+ await page.getByRole('button', { name: 'Save', exact: true }).click();
```

This was the only change needed, but it cost 30 minutes of debugging across three test retries. The filter kept finding elements, the `click` kept throwing strict-mode violations, and the error message itself was misleading — it showed the second element as `aka getByRole('button', { name: 'Unsaved changes View' })`, which didn't explain *why* it matched `'Save'`.

### The principle

| Problem | `{ name }` matching |
|---------|---------------------|
| `name: 'Save'` matches `"Unsaved changes View"` | Substring, case-insensitive |
| `name: 'Status'` could match `"No Status"` | Same |
| `name: 'Title'` could match `"Sub-title"` | Same |

**Rule**: whenever a `getByRole` strict-mode error lists an element whose visible text doesn't obviously match your `name`, suspect substring matching. Add `exact: true` and retry.

---

## Gotcha 2: GitHub's filter bar replaces, never adds

### The setup

TBL-03 originally targeted multi-field filtering:

```gherkin
Scenario: Filter table by status AND label → verify intersection works
  Given issue "A" exists with status "Backlog" and label "bug"
  And issue "B" exists with status "Done" and label "bug"
  When I filter the view by status "Backlog" and label "bug"
  Then only issue "A" should be visible
```

The naive implementation applied two filters sequentially:

```typescript
// Step 1: filter by status
await page.getByRole('combobox', { name: 'Filter' }).click();
await page.getByRole('option', { name: 'Status, Filter' }).click();
await page.getByRole('option', { name: 'Backlog, Status' }).click();
await page.getByRole('button', { name: 'Save', exact: true }).click();
// URL: ?filterQuery=status%3ABacklog

// Step 2: add label filter
await page.getByRole('combobox', { name: 'Filter' }).click();
// ... select Label, select "bug" ...
await page.getByRole('button', { name: 'Save', exact: true }).click();
// URL: ?filterQuery=label%3Abug   ← status filter gone!
```

After step 2's Save, the URL contained only `filterQuery=label%3Abug`. The status filter was replaced, not combined.

We tested two theories:

1. **Multiple `filterQuery` URL parameters**: `?filterQuery=status%3ABacklog&filterQuery=label%3Abug` — GitHub ignores the second value.

2. **Typing into the active filter combobox**: filling `label:bug` while `status:Backlog` was active — GitHub replaced the existing filter, same as the Save button.

Both failed. The filter bar accepts **one `filterQuery` at a time**, period.

### The pivot

We redesigned TBL-03 to test single-field filtering with a strong negative case:

```gherkin
Scenario: Filter table by a field and verify matching rows
  Given issue "A" exists with status "Backlog" and label "bug"
  And issue "B" exists with status "Done" and no label
  When I filter the table by label "bug"
  Then issue "A" should be visible
  And issue "B" should not be visible
```

The test still proves the filter works correctly — it just proves it for one criterion at a time. Multi-field intersection remains untestable through GitHub's current filter UI.

### The principle

**Before you build a 3-step filter sequence in Gherkin**, test it in playwright-cli first. Open the browser, apply two filters manually, and check the URL. If the URL only shows one `filterQuery`, your test needs a redesign — not a workaround.

---

## Gotcha 3: The "Unsaved changes" backdrop blocks the view

### The setup

Switching a project view from Board to Table layout opens GitHub's "View" dropdown menu. The flow:

```typescript
await page.getByRole('button', { name: 'View', exact: true }).click();
await page.getByRole('button', { name: 'Table' }).click();
await page.waitForURL(/layout=table/);
await expect(page.getByRole('grid')).toBeVisible(); // Table renders
```

So far so good. But when the next step tried to click the filter combobox:

```
locator resolved to <input role="combobox" ... value="status:Backlog"/>
- <div class="prc-Dialog-Backdrop-5Nt2U">…</div> subtree intercepts pointer events
```

A `prc-Dialog-Backdrop` (Primer React backdrop) was sitting on top of the entire page, intercepting every click. Where did it come from?

### Root cause

GitHub's View menu doesn't close cleanly after you switch layouts. When you change from Board to Table:

1. The menu item is clicked → the layout switches
2. But the menu stays open in **"Unsaved changes"** mode
3. This state renders buttons ("Save view", "Discard") inside a dialog overlay
4. The dialog creates a full-page **backdrop** that blocks pointer events

Our first instinct — `page.keyboard.press('Escape')` — didn't help. The Escape key dismissed the menu content but left the backdrop `<div>` in the DOM.

### The fix

Two-part solution:

```typescript
When('I switch to the table layout view', async ({ page }) => {
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('button', { name: 'Table' }).click();
  await page.waitForURL(/layout=table/);
  await expect(page.getByRole('grid')).toBeVisible({ timeout: 15000 });

  // Dismiss the Unsaved changes overlay
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500); // Let the backdrop unmount
});
```

And after each filter Save, add a second Escape:

```typescript
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForURL(/filterQuery/);
await page.keyboard.press('Escape'); // Dismiss any lingering overlay
await page.waitForTimeout(300);
```

The 500ms/300ms waits are intentional — Primer's backdrop uses CSS transitions for enter/exit animations. Without the wait, the next click can land during the exit animation while the backdrop is still in the DOM.

### The principle

**Dialogs that don't auto-close after an action leave backdrops.** After any action that triggers a layout change (tab switch, view switch, mode toggle), check `document.querySelector('[class*="Backdrop"]')` in playwright-cli. If one exists, you need to dismiss it before proceeding.

---

## Gotcha 4: The filter bar and column options are two separate filtering systems

### The setup

While debugging TBL-03's filter behavior, we noticed something strange: after applying a filter via the global filter bar (`combobox "Filter"`), the table's column headers showed no visual indication of filtering. But clicking a column's "column options" button showed a separate "Filter by values…" option.

These are **two independent filtering systems** that live on the same page:

| System | Trigger | Scope | URL effect |
|--------|---------|-------|------------|
| Global filter bar | `combobox "Filter"` in the toolbar | Project-wide | Updates `?filterQuery=` |
| Column filter | `button "X column options"` → `"Filter by values…"` | Column-local | Updates internal view config |

The global filter bar replaces the URL's `filterQuery` parameter and removes non-matching rows from the grid. The column filter modifies the view's internal configuration but doesn't touch the URL.

### How this confused us

We spent 20 minutes trying to make the "Status, Filter" option in the global bar compose with the "Label, Filter" option (Gotcha 2). The correct approach was staring at us the whole time:

```yaml
# Clicking the Status column header options revealed:
- menuitem "Filter by values…"
```

We could have filtered by status via the column header's built-in filter, then added a label filter via the global bar. Two separate systems working in parallel — no replacement issue.

But by the time we realized this, we'd already redesigned the test (Gotcha 2's pivot). The column-filter approach would have worked, but it introduced a new problem: the column filter for **Labels** isn't available unless you add the Labels column to the table (it's not shown by default). Adding it dynamically through the "Add field" button would have made the test three steps longer.

### The principle

**Study the full locator tree before writing the first line of code.** A 30-second `playwright-cli snapshot` of the table header would have shown us the column filter options immediately, saving the two-hour filter bar odyssey.

---

## What went right

Not everything was a fight. Three scenarios shipped in the first pass:

**Comments (CMT-01/02)** were the easiest domain in the entire project. The API methods already existed:

```typescript
// src/utils/api-client.ts — methods that sat unused for weeks
async addComment(repo, issueNumber, body): Promise<GitHubComment>
async updateComment(repo, commentId, body): Promise<GitHubComment>
```

The step definitions were one-liners:

```typescript
When('I add a comment {string} via the API', async ({ githubAPI, seededProjectIssue }, body) => {
  await githubAPI.addComment(env.github.testRepo, seededProjectIssue.number, body);
});
```

Verification used simple text matching:

```typescript
Then('I should see the comment {string} on the issue', async ({ page }, body) => {
  await expect(page.getByText(body)).toBeVisible();
});
```

Two scenarios, two API calls, zero playwright-cli sessions. The test infrastructure earned its keep here.

**Bulk operations (BULK-01)** and **search (SRCH-01)** were straightforward API-first tests: seed data via REST/GraphQL, verify in the UI. The bulk test moved two issues simultaneously via `moveItemToStatus`, and the search test used the filter bar's "Title, Filter" option followed by `page.keyboard.type()`. Both passed on the first attempt.

---

## The locator table

| UI Element | Locator | Gotcha |
|-----------|---------|--------|
| Open View menu | `getByRole('button', { name: 'View', exact: true })` | #3 |
| Switch to Table | `getByRole('button', { name: 'Table' })` | #3 |
| Table grid | `getByRole('grid')` | Wait for render after layout switch |
| Column header | `getByRole('columnheader', { name: /^Title/ })` | Compound name: "Title Title column options" |
| Column options | `getByRole('button', { name: 'Title column options' })` | #4 |
| Sort ascending | `getByRole('menuitem', { name: 'Sort ascending' })` | Wait for `sortedBy` in URL |
| Sort descending | `getByRole('menuitem', { name: 'Sort descending' })` | Same |
| Table row by title | `getByRole('row').filter({ hasText: title })` | Pre-existing rows pollute results |
| Row title link | `getByRole('rowheader').getByRole('link')` | Used for sort order verification |
| Filter combobox | `getByRole('combobox', { name: 'Filter' })` | #2, #3 |
| Status filter type | `getByRole('option', { name: 'Status, Filter' })` | Not "Status, Filter, Filter by status" |
| Status value | `getByRole('option', { name: 'Backlog, Status' })` | Not `exact: true` on status name |
| Label filter type | `getByRole('option', { name: 'Label, Filter, Filter by label' })` | #2 |
| Label value | `getByRole('option', { name: 'bug, Label' })` | Same |
| Title search filter | `getByRole('option', { name: 'Title, Filter' })` | Then `page.keyboard.type(keyword)` |
| Apply filter | `getByRole('button', { name: 'Save', exact: true })` | #1 |
| Dismiss overlay | `page.keyboard.press('Escape')` | #3 — add `waitForTimeout(500)` |
| Comment text | `page.getByText(body)` | Works for both original and edited |

---

## Key takeaways

| Lesson | Why it matters |
|--------|---------------|
| **`exact: true` is not optional on short names** | `'Save'` matches `'Unsaved'`, `'Status'` matches `'No Status'`, `'Title'` matches `'Sub-title'`. Any button name shorter than 6 characters risks substring collisions. Default to `exact: true` unless you specifically need partial matching. |
| **Test the filter composition before designing the test** | GitHub's filter bar is single-filter. You can't `AND` two criteria through the UI. Discover this in playwright-cli, not in the test runner. |
| **Dialogs leave backdrops — and backdrops block clicks** | After any action that triggers a UI state change (layout switch, view toggle), check for lingering overlays. A single `Escape` + 500ms wait is the cheapest insurance policy. |
| **Column options and global filters are separate systems** | Don't assume one replaces the other. Read the full ARIA tree. A 30-second snapshot of the column headers would have revealed the column-level filter path two hours earlier. |
| **The test infrastructure pays compound interest** | Comments (CMT-01/02) took 5 minutes because the API client, fixture, and data lifecycle were already battle-tested. Every domain you add makes the next one faster. |

---

Phase 4 delivered 7 scenarios across 4 domains in 3.5 hours. The 4 gotchas above consumed roughly 2 hours of that — and taught us more about GitHub's DOM than the previous 17 passing tests combined. The test plan now stands at 24 scenarios (7 domains) with full create/label/assign/estimate/track/collaborate/search lifecycle coverage.

*Next up: Phase 5 — Custom Fields, Draft Items, Archive, Date/Iteration fields, Saved Views, Ranking, and Auto-Workflows.*
