# Test Plan — GitHub Project Management (Jira-like Workflows)

> **Target:** GitHub Projects on a persistent sandbox project  
> **Pattern:** API seeds data → Playwright verifies UI → DataManager auto-cleans up  
> **Auth:** Required for E2E+API tests (test GitHub account)  
> **Last updated:** 2026-05-27

---

## Strategy

### Approach A: Persistent Sandbox Project

A single pre-created project (`e2e-sandbox`) lives permanently. Tests share it — no create/destroy overhead, no rate-limit noise.

- **Each test** seeds issues/labels/milestones into the sandbox, verifies in UI, cleans up its own data
- **Cleanup is per-issue** — labels removed, issues deleted or archived, comments deleted
- **Tests use unique names** (`e2e-${Date.now()}-${testName}`) so parallel execution doesn't collide
- **The project itself** is never touched by tests (one-off `@setup` test validates create once)

### Real-World Relevance

GitHub Projects mirrors the patterns QA engineers test in Jira, Linear, Asana, and Monday.com:

| Jira Concept            | GitHub Projects Equivalent                                   |
| ----------------------- | ------------------------------------------------------------ |
| Issue                   | Issue                                                        |
| Board                   | Board view (Kanban)                                          |
| Labels / Components     | Labels                                                       |
| Sprints / Fix Versions  | Iterations / Milestones                                      |
| Custom Fields           | Custom Fields (Text, Number, Date, Single Select, Iteration) |
| JQL Filters             | Saved Views with filters                                     |
| Bulk Change             | Bulk operations                                              |
| Workflow Post-Functions | Auto-workflows                                               |

---

## Status Legend

- ✅ Automated
- 🔧 In Progress
- 📝 Planned
- ❌ Blocked
- ⏸️ Deferred

## Priority

| Level  | Criteria                                      |
| ------ | --------------------------------------------- |
| **P0** | Core flow — must work before any PR can merge |
| **P1** | Important feature — runs on every PR          |
| **P2** | Edge case / polish — runs nightly             |

## Type

| Tag       | Description                                      |
| --------- | ------------------------------------------------ |
| `E2E+API` | API seed/cleanup + UI verification (most common) |
| `E2E`     | Pure UI test — no API, no auth required          |
| `@setup`  | One-off validation — skipped in CI               |

---

## Test Scenarios

### 1. Issue CRUD

Core create/read/update/delete operations — the foundation.

| ID     | Scenario                                                                             | Priority | Type    | Status |
| ------ | ------------------------------------------------------------------------------------ | -------- | ------- | ------ |
| ISS-01 | Create issue via API → verify title, body, and metadata render in list + detail view | P0       | E2E+API | ✅     |
| ISS-02 | Update issue description → verify changes reflect in detail view                     | P1       | E2E+API | ✅     |
| ISS-03 | Close issue → verify status badge changes to "Closed"                                | P1       | E2E+API | ✅     |
| ISS-04 | Reopen closed issue → verify status restored to "Open"                               | P1       | E2E+API | ✅     |

---

### 2. Labels & Metadata

Label lifecycle — Jira's Components/Labels equivalent.

| ID     | Scenario                                                             | Priority | Type    | Status |
| ------ | -------------------------------------------------------------------- | -------- | ------- | ------ |
| LBL-01 | Add label via UI → verify label chip visible in issue detail view    | P1       | E2E+API | ✅     |
| LBL-02 | Add multiple labels via UI → verify all render                       | P1       | E2E+API | ✅     |
| LBL-03 | Remove label via UI → verify chip disappears                         | P1       | E2E+API | ✅     |
| LBL-04 | Filter board by label → verify only matching issues shown            | P1       | E2E+API | ✅     |

---

### 3. Milestones

Group issues by milestone, track progress — Jira's Fix Versions equivalent.

| ID     | Scenario                                                         | Priority | Type    | Status |
| ------ | ---------------------------------------------------------------- | -------- | ------- | ------ |
| MIL-01 | Create milestone with due date → verify appears in issue sidebar | P1       | E2E+API | ✅     |
| MIL-02 | Link issues to milestone → verify milestone progress bar updates | P1       | E2E+API | ✅     |
| MIL-03 | Close milestone → verify "Completed" status and progress at 100% | P2       | E2E+API | ✅     | ✅     |

---

### 4. Assignees

Ownership and filtering by assignee.

| ID     | Scenario                                                     | Priority | Type    | Status |
| ------ | ------------------------------------------------------------ | -------- | ------- | ------ |
| ASN-01 | Assign issue to user → verify avatar/name appears on card    | P1       | E2E+API | ✅     |
| ASN-02 | Unassign issue → verify assignee cleared from card           | P2       | E2E+API | ✅     |
| ASN-03 | Filter board by assignee → verify only assigned issues shown | P1       | E2E+API | ✅     |

---

### 5. Board Workflow (Kanban)

Items moving through status columns — the core project management flow.

| ID     | Scenario                                                                            | Priority | Type    | Status |
| ------ | ----------------------------------------------------------------------------------- | -------- | ------- | ------ |
| BRD-01 | Move issue Todo → In Progress → Done via API, verify column position at each step   | P0       | E2E+API | ✅     |
| BRD-02 | Move issue backwards (In Progress → Backlog) → verify it returns to Backlog column  | P1       | E2E+API | ✅     |
| BRD-03 | Verify issue appears in correct column after status change                          | P1       | E2E+API | ✅     |
| BRD-04 | Drag-and-drop issue between columns → verify status updated (via API read-back)     | P2       | E2E+API | ✅     |

---

### 6. Table & Views

Alternative view and data sorting/filtering — Jira's List view equivalent.

| ID     | Scenario                                                                            | Priority | Type    | Status |
| ------ | ----------------------------------------------------------------------------------- | -------- | ------- | ------ |
| TBL-01 | Switch to table view → verify columns render (title, status, assignee)              | P1       | E2E+API | ✅     |
| TBL-02 | Sort table by a column → verify order changes correctly                             | P1       | E2E+API | ✅     |
| TBL-03 | Filter table by a field → verify matching rows shown                                | P1       | E2E+API | ✅     |

---

### 7. Comments

Collaboration on issues — the most-used Jira collaboration feature.

| ID     | Scenario                                                                       | Priority | Type    | Status |
| ------ | ------------------------------------------------------------------------------ | -------- | ------- | ------ |
| CMT-01 | Add comment to issue → verify appears in timeline with correct text            | P1       | E2E+API | ✅     |
| CMT-02 | Edit comment → verify updated text appears                                     | P2       | E2E+API | ✅     |

---

### 8. Bulk Operations

Multi-select and batch update — sprint planning power feature.

| ID      | Scenario                                                                  | Priority | Type    | Status |
| ------- | ------------------------------------------------------------------------- | -------- | ------- | ------ |
| BULK-01 | Seed multiple issues → bulk update status via API → verify all changed    | P1       | E2E+API | ✅     |

---

### 9. Custom Fields

User-defined metadata — Jira's custom fields are the #1 reason orgs configure projects.

| ID     | Scenario                                                                                        | Priority | Type    | Status |
| ------ | ----------------------------------------------------------------------------------------------- | -------- | ------- | ------ |
| FLD-01 | Create custom field (Text / Number / Single Select) → set value on issue → verify in table view | P1       | E2E+API | ✅     |
| FLD-02 | Filter/sort board by custom field value → verify correct results                                | P2       | E2E+API | ✅     |

---

### 10. Draft Items

Quick-add cards without creating full issues — Jira's "create" shortcut.

| ID      | Scenario                                                                   | Priority | Type    | Status |
| ------- | -------------------------------------------------------------------------- | -------- | ------- | ------ |
| DRFT-01 | Create draft item on board → verify appears in column without issue number | P2       | E2E     | ✅     |
| DRFT-02 | Convert draft to issue → verify gets issue number and full detail view     | P2       | E2E+API | ✅     |

---

### 11. Archive

Lifecycle beyond open/closed — different from delete.

| ID     | Scenario                                                   | Priority | Type    | Status |
| ------ | ---------------------------------------------------------- | -------- | ------- | ------ |
| ARC-01 | Archive issue from board → verify hidden from active views | P2       | E2E+API | ✅     |
| ARC-02 | Restore archived item → verify reappears in board          | P2       | E2E+API | ✅     |

---

### 12. Date & Iteration Fields

Time-based fields — due dates, sprint assignment.

| ID       | Scenario                                                      | Priority | Type    | Status |
| -------- | ------------------------------------------------------------- | -------- | ------- | ------ |
| TDATE-01 | Set custom Date field → verify rendered in table + board card | P2       | E2E+API | ✅     |
| ITER-01  | Set Iteration field → verify appears on card                  | P2       | E2E+API | ✅     |

---

### 13. Saved Views

Persistent filter configurations — Jira's saved boards/queries.

| ID      | Scenario                                                                          | Priority | Type    | Status |
| ------- | --------------------------------------------------------------------------------- | -------- | ------- | ------ |
| VIEW-01 | Create saved view with filter + sort → verify configuration persists after reload | P2       | E2E+API | ✅     |
| VIEW-02 | Switch between saved views → verify correct filtered data shown                   | P2       | E2E     | ✅     |

---

### 14. Ranking

Backlog prioritization — order matters.

| ID      | Scenario                                                                | Priority | Type    | Status |
| ------- | ----------------------------------------------------------------------- | -------- | ------- | ------ |
| RANK-01 | Reorder items within a column → verify order persists after page reload | P2       | E2E+API | ✅     |

---

### 15. Auto-Workflows

Rule-based automation — Jira's "when X, do Y" post-functions.

| ID       | Scenario                                                                                       | Priority | Type    | Status |
| -------- | ---------------------------------------------------------------------------------------------- | -------- | ------- | ------ |
| WFLOW-01 | Configure auto-workflow (on close → move to Done) → close issue via API → verify it auto-moves | P2       | E2E+API | ✅     |

---

### 16. In-Project Search

Find issues within the project scope.

| ID      | Scenario                                                                | Priority | Type    | Status |
| ------- | ----------------------------------------------------------------------- | -------- | ------- | ------ |
| SRCH-01 | Search issues within project by keyword → verify matching results shown | P1       | E2E+API | ✅     |

---

## Coverage Summary

| Area              | Scenarios | P0    | P1     | P2     | Done |
| ----------------- | --------- | ----- | ------ | ------ | ---- |
| Issue CRUD        | 4         | 1     | 3      | 0      | 4    |
| Labels & Metadata | 4         | 0     | 4      | 0      | 4    |
| Milestones        | 3         | 0     | 2      | 1      | 3    |
| Assignees         | 3         | 0     | 2      | 1      | 3    |
| Board Workflow    | 4         | 1     | 2      | 1      | 4    |
| Table & Views     | 3         | 0     | 3      | 0      | 3    |
| Comments          | 2         | 0     | 1      | 1      | 2    |
| Bulk Operations   | 1         | 0     | 1      | 0      | 1    |
| Custom Fields     | 2         | 0     | 1      | 1      | 2    |
| Draft Items       | 2         | 0     | 0      | 2      | 2    |
| Archive           | 2         | 0     | 0      | 2      | 2    |
| Date & Iteration  | 2         | 0     | 0      | 2      | 2    |
| Saved Views       | 2         | 0     | 0      | 2      | 2    |
| Ranking           | 1         | 0     | 0      | 1      | 1    |
| Auto-Workflows    | 1         | 0     | 0      | 1      | 1    |
| In-Project Search | 1         | 0     | 1      | 0      | 1    |
| **Total**         | **37**    | **2** | **21** | **14** | **37**|

**Full lifecycle covered:** Create → Label → Assign → Estimate (milestone/iteration) → Prioritize (rank) → Track (board) → Collaborate (comments) → Report (views/table) → Search → Bulk update → Complete (archive/auto-workflow).

---

## Prerequisites

### Sandbox Project

A GitHub project named `e2e-sandbox` must exist before any tests run. The project should have:

- **Board layout:** Kanban with Todo / In Progress / Done columns
- **Label group:** Pre-configured with test labels (`bug`, `enhancement`, `documentation`)
- **Custom fields:** `Priority` (Single Select: High/Medium/Low), `Effort` (Number), `Target Date` (Date)

### Authentication

Create a `.env` file:

```
GITHUB_USERNAME=your-test-account
GITHUB_PASSWORD=your-test-password
GITHUB_PROJECT_SANDBOX=e2e-sandbox
```

**Security:** `.env` is gitignored. The test account should be dedicated (not your personal account) and have access only to the sandbox project.

---

## Implementation Sequence

1. **Phase 1 — Core ✅:** ISS-01/02/03/04, BRD-01/02/03/04 — all P0s + P1s for issue CRUD and board workflow. Proves the data lifecycle and UI interaction patterns work.
2. **Phase 2 — Labels ✅:** LBL-01/02/03/04 — label add, multi-add, remove via UI, board filter. Introduces playwright-cli for UI discovery.
3. **Phase 3 — Metadata ✅:** ASN-01/02/03, MIL-01/02 — assignees and milestones. Rounds out the P1s.
4. **Phase 4 — Views & Collaboration ✅:** TBL-01/02/03, CMT-01/02, BULK-01, SRCH-01 — table mode, comments, bulk ops, search.
5. **Phase 5 — Advanced ✅:** FLD-01/02, DRFT-01/02, ARC-01/02, TDATE-01, ITER-01, VIEW-01/02, RANK-01, MIL-03, WFLOW-01 — P2s and edge cases. All 37 scenarios automated.
6. **Phase 6 — CI:** GitHub Actions for read-only + authenticated suite on schedule.

---

## Intentionally Excluded

- **Attachments in comments** — file upload automation is unreliable across GitHub's UI
- **Notifications** — GitHub uses email; not in-app testable
- **Issue linking** (`#123` references) — hard to verify in UI without brittle selectors
- **Roadmap/Timeline view** — covered by milestones (MIL-01/02)
- **Wiki pages** — not a project management feature
