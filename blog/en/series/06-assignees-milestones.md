# Assignees & Milestones: The Sidebar Pattern Pays Off

> **Part 6 of the Playwright E2E series.**
> [Part 1](/blog/01-why-real-websites.md) — Why real websites beat demo apps
> [Part 2](/architecture-tour) — Architecture of a production-grade E2E suite
> [Part 3](/fixtures-over-basetest) — Why fixtures over BaseTest
> [Part 4](/blog/04-authentication-without-2fa.md) — Authentication without the 2FA nightmare
> [Part 5](/blog/05-building-label-tests-with-ui-discovery.md) — Building E2E label tests with UI discovery

---

## The premise: five scenarios, zero new patterns to learn

After shipping the labels suite, the next phase in our test plan was **Assignees & Milestones** — five scenarios that cover ownership and release tracking:

| ID     | Scenario                                                                | Type    |
| ------ | ----------------------------------------------------------------------- | ------- |
| ASN-01 | Assign issue to user → verify avatar/name appears on card               | E2E+API |
| ASN-02 | Unassign issue → verify assignee cleared from card                      | E2E+API |
| ASN-03 | Filter kanban board by assignee → verify only assigned issues shown     | E2E+API |
| MIL-01 | Create milestone with due date → verify it appears in issue sidebar     | E2E+API |
| MIL-02 | Link issues to milestone → verify progress bar shows partial completion | E2E+API |

The labels phase taught us something important: **GitHub's sidebar uses the same dialog pattern for every metadata field**. Labels, assignees, milestones, projects — they all share `button "Edit X"` → `dialog "Select X"` → `option { name }` → `Escape`.

This meant we weren't starting from scratch. We were verifying whether the pattern held.

---

## Discovery session: 20 minutes, two dialogs

### Assignee dialog

We loaded the auth state, navigated to a test issue, and opened the assignee picker:

```bash
playwright-cli open
playwright-cli state-load auth/github.json
playwright-cli goto https://github.com/mihaamiharu/github-projects-e2e/issues/200
playwright-cli click "getByRole('button', { name: 'Edit Assignees' })"
```

The snapshot revealed exactly what we expected:

```yaml
- dialog "Select assignees" [ref=e540]:
    - heading "Select assignees" [level=1]
    - combobox "Filter assignees" [expanded]
    - listbox "User results":
        - option "ekkisyam23"
        - option "mihaamiharu"
```

Same pattern as labels — a dialog, a filter combobox, and toggleable options. Selecting an assignee:

```bash
playwright-cli click "getByRole('option', { name: 'ekkisyam23' })"
playwright-cli press Escape
```

After closing the dialog, the sidebar updated. The assignee appeared in a dedicated section with `data-testid="sidebar-assignees-section"`. The username was a link inside `data-testid="issue-assignees"`.

### Milestone dialog

Same flow, different button:

```bash
playwright-cli click "getByRole('button', { name: 'Edit Milestone' })"
```

```yaml
- dialog "Set milestone" [ref=e718]:
    - heading "Set milestone" [level=1]
    - combobox "Filter milestones" [expanded]
    - generic: No milestones were found
```

The dialog was empty — our test repo had no milestones yet. That's the point: the API seeds them first, then the UI verifies.

When a milestone existed, it showed as `data-testid="issue-milestone-container"` inside `data-testid="sidebar-milestones-section"`, with title text and due date.

### Board filter by assignee

The board filter for assignees was slightly different from labels. Labels used a modal filter with a "Save" button. The project board uses an inline filter bar:

```bash
playwright-cli goto https://github.com/users/mihaamiharu/projects/8/views/1
playwright-cli click "getByRole('combobox').first()"
```

The filter bar expanded with type options:

```
- option "Is"
- option "Assignee"
- option "Label"
- option "Status"
- option "Milestone"
- ...
```

Selecting "Assignee" narrowed to sub-options:

```
- option "No assignee"
- option "Has assignee"
- option "Me"
```

The URL updated to `?filterQuery=assignee%3A` on the first select, then fully resolved on the second. No "Save" button — the filter applies immediately.

### The full locator table

| UI Element                  | Locator                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------ |
| Open assignee picker        | `getByRole('button', { name: 'Edit Assignees' })`                                    |
| Assignee dialog             | `getByRole('dialog', { name: 'Select assignees' })`                                  |
| Select assignee             | `dialog.getByRole('option', { name: username })`                                     |
| Verify assignee             | `getByTestId('sidebar-assignees-section').getByRole('link', { name: username })`     |
| Verify no assignee          | `getByTestId('sidebar-assignees-section').getByText('No one')`                       |
| Open milestone picker       | `getByRole('button', { name: 'Edit Milestone' })`                                    |
| Milestone dialog            | `getByRole('dialog', { name: 'Set milestone' })`                                     |
| Verify milestone in sidebar | `getByTestId('sidebar-milestones-section').getByTestId('issue-milestone-container')` |
| Board filter input          | `getByRole('combobox').first()`                                                      |
| Select "Assignee" filter    | `getByRole('option', { name: 'Assignee' })`                                          |
| Select "Has assignee"       | `getByRole('option', { name: 'Has assignee' })`                                      |
| Milestone progress bar      | `locator('[role="progressbar"]')` with `aria-valuenow`                               |

---

## API: milestones need REST, assignees reuse existing code

### Assignees — zero new API code

Assignees were already a first-class field on the REST issue endpoint. Our `GitHubAPI.updateIssue()` accepted `assignees: string[]` from day one. No GraphQL, no field resolution, no new methods. Just:

```typescript
// Assign
await githubAPI.updateIssue(repo, issueNumber, {
  assignees: [env.github.username],
});

// Unassign
await githubAPI.updateIssue(repo, issueNumber, {
  assignees: [],
});
```

GitHub syncs issue assignees to project board cards automatically, so the board filter picks them up without any project-level mutation.

### Milestones — three new REST methods

Milestones are repository-level objects (separate from Project V2 Iterations). The GitHub REST API has `POST /repos/{owner}/{repo}/milestones`, and our client needed three methods:

```typescript
// src/utils/api-client.ts
async createMilestone(repo, { title, description?, due_on? }): Promise<GitHubMilestone>
async getMilestone(repo, milestoneNumber): Promise<GitHubMilestone>
async deleteMilestone(repo, milestoneNumber): Promise<void>
```

We also added `milestone` to `CreateIssueParams` so a new issue can be linked to a milestone at birth:

```typescript
await githubAPI.createIssue(repo, {
  title: 'e2e-mil-issue',
  milestone: milestoneNumber, // links on creation
});
```

### Cleanup order matters

Milestones go into the DataManager cleanup queue alongside issues and project items. The LIFO order is critical:

```
DataManager queue (LIFO):
  1. Remove issue from project
  2. Close issue
  3. Delete milestone        ← cleanup runs this FIRST
```

If you enqueue milestone deletion before issue unlinking, GitHub returns an error — you can't delete a milestone that still has linked issues. The fix: always close issues first (so they stop counting against milestone progress), then delete the milestone.

---

## The progress bar gotcha

MIL-02 navigates to the milestone page and verifies a partial progress bar. The natural locator:

```typescript
const progressBar = page.getByRole('progressbar');
```

This failed with `Timeout 20000ms exceeded`. But the element was on the page — a `<span role="progressbar" aria-valuenow="50" aria-valuemax="100">`. The CSS attribute selector worked:

```typescript
const progressBar = page.locator('[role="progressbar"]');
// Found immediately
```

`getByRole()` queries the accessibility tree, which requires the browser to compute the accessible name and state. GitHub's `<span>` with `role="progressbar"` rendered correctly in the DOM but wasn't exposed as a progressbar widget in the computed accessibility tree at the time of query. The raw attribute selector bypasses the tree computation and hits the DOM directly.

This is a reminder that `getByRole()` is the ideal, but `locator('[role="..."]')` is the fallback when the accessibility tree lags behind the DOM.

---

## The Gherkin: five scenarios, same Background

Both feature files share the same fixture-defined background:

```gherkin
# features/github/assignees.feature
Background:
  Given a seeded project issue exists on the kanban board

Scenario: ASN-01 — Assign issue to user via API and verify on issue page
  When I assign the issue to myself via the API
  And I navigate to the issue page
  Then I should see myself as the assignee on the issue

Scenario: ASN-02 — Unassign issue and verify assignee cleared
  When I assign the issue to myself via the API
  And I unassign the issue via the API
  And I navigate to the issue page
  Then I should see no assignee on the issue

Scenario: ASN-03 — Filter board by assignee, verify only assigned shown
  When I assign the issue to myself via the API
  And I seed a second unassigned issue on the board
  And I navigate to the kanban view
  And I filter the board by assignee "Has assignee"
  Then the seeded issue should be visible on the board
  And the second unassigned issue should not be visible on the board
```

```gherkin
# features/github/milestones.feature
Scenario: MIL-01 — Create milestone with due date, verify in sidebar
  When I create a milestone with a due date via the API
  And I link the seeded issue to the milestone via the API
  And I navigate to the issue page
  Then I should see the milestone name in the issue sidebar

Scenario: MIL-02 — Link issues to milestone, verify progress bar
  When I create a milestone with a due date via the API
  And I link the seeded issue to the milestone via the API
  And I seed a second issue on the board linked to the milestone
  And I close the seeded issue via the API
  And I navigate to the milestone page
  Then I should see the milestone progress bar showing partial completion
```

ASN-03 reuses `Then the seeded issue should be visible on the board` from the labels step definitions — zero code duplication. The step library grows, but each new feature file adds only the steps unique to its domain.

---

## What we didn't have to build

| Component              | Effort  | Reason                                                                                 |
| ---------------------- | ------- | -------------------------------------------------------------------------------------- |
| Data lifecycle         | 0 lines | `github-project.fixture.ts` seeded issues, `DataManager` auto-cleaned up               |
| Auth setup             | 0 lines | `ensureAuthCookies()` in the `page` fixture override — loaded once per test            |
| Board navigation       | 0 lines | `When I navigate to the kanban view` already defined in board-workflow steps           |
| Issue visibility check | 0 lines | `Then the seeded issue should be visible on the board` already defined in labels steps |
| Assignee API           | 0 lines | `updateIssue({ assignees })` existed from Phase 1                                      |

The only net-new code was milestone REST methods (63 lines), five step definitions, and two feature files. The fixture architecture absorbed everything else.

---

## Key takeaways

| Lesson                                           | Why it matters                                                                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sidebar patterns are reusable**                | The `button "Edit X"` → `dialog` → `option` → `Escape` flow works for labels, assignees, and milestones. Discover it once, apply it everywhere.                     |
| **REST over GraphQL when possible**              | Assignees work via the issue REST endpoint — no field resolution, no GraphQL mutations, no eventual consistency headaches. If GitHub exposes it via REST, use REST. |
| **Milestones are repo-level, not project-level** | They live at `/repos/{owner}/{repo}/milestones`, not in the Project V2 GraphQL API. Understanding the data model before coding prevents dead ends.                  |
| **`getByRole()` can miss DOM-attached roles**    | The `<span role="progressbar">` was in the DOM but not the accessibility tree. `locator('[role="progressbar"]')` is the reliable fallback.                          |
| **LIFO cleanup order is non-negotiable**         | Milestones can't be deleted while they have linked issues. Close issues first, then remove them from the project, then delete the milestone.                        |
| **A growing step library compounds**             | 5 new scenarios added only 5 new step definitions — the rest came from existing steps defined in Phase 1 and Phase 2. Every phase makes the next one faster.        |

---

## Progress: 17 of 37 scenarios

| Phase             | Scenarios | Status  |
| ----------------- | --------- | ------- |
| Issue CRUD        | ISS-01–04 | Done    |
| Board Workflow    | BRD-01–04 | Done    |
| Labels & Metadata | LBL-01–04 | Done    |
| Assignees         | ASN-01–03 | Done    |
| Milestones        | MIL-01–02 | Done    |
| **Total**         | **17/37** | **46%** |

The sidebar pattern has been proven against three metadata types. Next: table views and comments — which will test whether the same discovery approach works for list-style and timeline interfaces, not just dialogs.

---

_Part 4: [Authentication without the 2FA nightmare](/blog/04-authentication-without-2fa.md)_
_Part 5: [Building E2E label tests with UI discovery](/blog/05-building-label-tests-with-ui-discovery.md)_
