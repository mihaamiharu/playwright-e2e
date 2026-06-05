# Scenario Catalog — 42 scenarios across 19 features

## Common Setup (Background)

Most features share a Background that seeds a project issue:

1. **API**: Create issue in `GH_TEST_REPO` via REST
2. **API**: Add issue to sandbox project via GraphQL
3. **Cleanup** (LIFO): Remove from project -> Close issue

---

## 1. Login (`login.feature`) — 3 scenarios

| ID           | Scenario                           | Tags          | Flow                                                                                                                                                                            |
| ------------ | ---------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LOGIN-01** | Login with valid credentials       | `@P0 @smoke`  | Navigate to `/login` -> Fill username -> Fill password (via `evaluate`) -> Click "Sign in" -> Assert URL matches `github.com` -> Assert dashboard heading or 2FA prompt visible |
| **LOGIN-02** | Login fails with wrong password    | `@P1 @noauth` | Navigate to `/login` -> Fill `"test-user"` / `"wrong-password"` -> Click "Sign in" -> Assert error alert contains "Incorrect username or password"                              |
| **LOGIN-03** | Login fails with empty credentials | `@P1 @noauth` | Navigate to `/login` -> Click "Sign in" without filling -> Assert URL stays on `/login` (HTML5 validation blocks submit)                                                        |

---

## 2. Issue CRUD (`issue-crud.feature`) — 4 scenarios

| ID         | Scenario                              | Tags         | Flow                                                                                                          |
| ---------- | ------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| **ISS-01** | Create issue via API, verify on board | `@P0 @smoke` | Seed issue -> Navigate to `/issues/{number}` -> Assert issue heading visible -> Assert issue number in header |
| **ISS-02** | Update issue description              | `@P1`        | Seed issue -> API update description -> Navigate to issue page -> Assert body contains new description        |
| **ISS-03** | Close issue, verify badge             | `@P1`        | Seed issue -> API close -> Navigate to issue page -> Assert "Closed" status badge                             |
| **ISS-04** | Reopen closed issue                   | `@P1`        | Seed issue -> API close -> API reopen -> Navigate to issue page -> Assert "Open" status badge                 |

---

## 3. Board Workflow (`board-workflow.feature`) — 3 scenarios

| ID         | Scenario                            | Tags         | Flow                                                                                                                                                                                                           |
| ---------- | ----------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BRD-01** | Move issue forward through statuses | `@P0 @smoke` | Seed issue -> API move to "In progress" -> Navigate to kanban view (with filter) -> Assert "In progress" heading visible + API confirms status -> API move to "Done" -> Navigate again -> Assert "Done" column |
| **BRD-02** | Move issue backwards                | `@P1`        | Seed issue -> API move to "In progress" -> API move to "Backlog" -> Navigate to kanban -> Assert "Backlog" column                                                                                              |
| **BRD-03** | Drag-and-drop between columns       | `@P2`        | Seed issue -> API move to "Backlog" -> Navigate to kanban -> Drag card from "Backlog" to "In progress" -> API verify status is "In progress"                                                                   |

**Navigation pattern**: `ProjectBoardPage.navigate(scenarioId)` -> `goto /users/{owner}/projects/{num}/views/1` -> `waitForGitHubNavigation` (wait for turbo progress bar to hide) -> `ensureBoardLayout` (if no h2 heading, click View > Board) -> fill filter input with `"{scenarioId}"` + press Enter

---

## 4. Table Views (`table-views.feature`) — 3 scenarios

| ID         | Scenario                        | Tags  | Flow                                                                                                                                                                                                                                              |
| ---------- | ------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TBL-01** | Switch to table, verify columns | `@P1` | Seed issue -> Navigate to kanban -> Switch to table layout (View > Table, wait for `layout=table` URL, assert grid visible, press Escape) -> Assert columns "Title", "Status", "Assignees" visible -> Assert seeded issue row visible             |
| **TBL-02** | Sort table by column            | `@P1` | Seed 2 issues with "AAA"/"ZZZ" prefixes -> Navigate to kanban -> Switch to table -> Sort Title ascending -> Assert AAA before ZZZ -> Sort descending -> Assert ZZZ before AAA                                                                     |
| **TBL-03** | Filter table by label           | `@P1` | Seed issue A (status "Backlog", label "bug") + issue B (status "Done", no label) -> Navigate to kanban -> Switch to table -> Open filter bar -> Select type "Label" -> Select option "bug" -> Save -> Assert issue A visible, issue B not visible |

---

## 5. Custom Fields (`custom-fields.feature`) — 2 scenarios

| ID         | Scenario                          | Tags  | Flow                                                                                                                                                                    |
| ---------- | --------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FLD-01** | Set custom field, verify in table | `@P1` | Seed issue -> API set "Priority" field to "P0" -> Navigate to kanban -> Switch to table -> Assert row shows "P0" in "Priority" column                                   |
| **FLD-02** | Filter table by custom field      | `@P2` | Seed issue + issue A (Priority "P0") + issue B (Priority "P1") -> Navigate to kanban -> Switch to table -> Filter by "Priority" "P0" -> Assert A visible, B not visible |

---

## 6. Labels (`labels.feature`) — 4 scenarios

| ID         | Scenario                   | Tags  | Flow                                                                                                                                                         |
| ---------- | -------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **LBL-01** | Add label via UI           | `@P1` | Seed issue -> Navigate to issue page -> Add "bug" label via UI -> Assert label visible                                                                       |
| **LBL-02** | Add multiple labels via UI | `@P1` | Seed issue -> Navigate to issue page -> Add "bug" -> Add "enhancement" -> Assert both visible                                                                |
| **LBL-03** | Remove label via UI        | `@P1` | Seed issue -> API add "bug" label -> Navigate to issue page -> Remove "bug" via UI -> Assert label gone                                                      |
| **LBL-04** | Filter board by label      | `@P1` | Seed issue -> API add "bug" -> Seed second unlabeled issue -> Navigate to kanban -> Filter by label "bug" -> Assert seeded issue visible, second not visible |

---

## 7. Assignees (`assignees.feature`) — 3 scenarios

| ID         | Scenario                       | Tags  | Flow                                                                                                                                         |
| ---------- | ------------------------------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **ASN-01** | Assign via API, verify on page | `@P1` | Seed issue -> API assign to self -> Navigate to issue page -> Assert assignee visible                                                        |
| **ASN-02** | Unassign via API               | `@P2` | Seed issue -> API assign -> API unassign -> Navigate to issue page -> Assert no assignee                                                     |
| **ASN-03** | Filter board by assignee       | `@P1` | Seed issue -> API assign -> Seed second unassigned issue -> Navigate to kanban -> Filter "Has assignee" -> Assert seeded visible, second not |

---

## 8. Comments (`comments.feature`) — 2 scenarios

| ID         | Scenario                            | Tags  | Flow                                                                                                                                                                 |
| ---------- | ----------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CMT-01** | Add comment via API, verify on page | `@P1` | Seed issue -> API add comment -> Navigate to issue page -> Assert comment text visible                                                                               |
| **CMT-02** | Edit comment via API                | `@P2` | Seed issue -> API add "Original comment text" -> API update to "Updated comment text" -> Navigate to issue page -> Assert updated text visible, original not visible |

---

## 9. Milestones (`milestones.feature`) — 3 scenarios

| ID         | Scenario                            | Tags  | Flow                                                                                                                                                                        |
| ---------- | ----------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MIL-01** | Create milestone, verify in sidebar | `@P1` | Seed issue -> API create milestone with due date -> API link issue to milestone -> Navigate to issue page -> Assert milestone name in sidebar                               |
| **MIL-02** | Link issues, verify progress bar    | `@P1` | Seed issue -> API create milestone -> Link issue -> Seed second issue linked to milestone -> Close first issue -> Navigate to milestone page -> Assert partial progress bar |
| **MIL-03** | Close milestone, verify completed   | `@P2` | Seed issue -> API create milestone -> Link both issues -> Close both -> Close milestone -> Navigate to milestone page -> Assert "Completed" + 100% progress                 |

---

## 10. Archive (`archive.feature`) — 2 scenarios

| ID         | Scenario                           | Tags  | Flow                                                                                       |
| ---------- | ---------------------------------- | ----- | ------------------------------------------------------------------------------------------ |
| **ARC-01** | Archive issue, verify hidden       | `@P2` | Seed issue -> API archive -> Navigate to kanban -> Assert issue not visible in any column  |
| **ARC-02** | Restore archived, verify reappears | `@P2` | Seed issue -> API archive -> API unarchive -> Navigate to kanban -> Assert issue reappears |

---

## 11. Auto-Workflows (`auto-workflows.feature`) — 1 scenario

| ID           | Scenario                              | Tags  | Flow                                                                                                  |
| ------------ | ------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------- |
| **WFLOW-01** | Close issue, verify auto-move to Done | `@P2` | Seed issue -> API close issue (triggers GitHub auto-workflow) -> API poll until item status is "Done" |

---

## 12. Bulk Operations (`bulk-operations.feature`) — 1 scenario

| ID          | Scenario                   | Tags  | Flow                                                                                                                                               |
| ----------- | -------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BULK-01** | Bulk update status via API | `@P1` | Seed issue -> Seed second issue -> API bulk move both to "In progress" -> Navigate to kanban -> Assert both in "In progress" column (via API poll) |

---

## 13. Draft Items (`draft-items.feature`) — 2 scenarios

| ID          | Scenario                      | Tags  | Flow                                                                                                                                                                              |
| ----------- | ----------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DRFT-01** | Create draft, verify on board | `@P2` | Seed issue -> API create draft "Draft test item" -> Navigate to kanban board -> **Verify via GraphQL API** (not UI) that draft exists with type `DRAFT_ISSUE` and no issue number |
| **DRFT-02** | Convert draft to full issue   | `@P2` | Seed issue -> API create draft -> API create full issue with same title -> Navigate to kanban view -> Assert card visible with `#number` pattern                                  |

---

## 14. Date & Iteration (`date-iteration.feature`) — 2 scenarios

| ID           | Scenario                             | Tags  | Flow                                                                                                                                   |
| ------------ | ------------------------------------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **TDATE-01** | Set date field, verify in table      | `@P2` | Seed issue -> API set "Target date" to "2026-12-31" -> API verify value -> Navigate to kanban -> Switch to table -> Assert row visible |
| **ITER-01**  | Set iteration field, verify on board | `@P2` | Seed issue -> API set "Iteration" to "Sprint 1" -> API verify value -> Navigate to kanban -> Assert card visible                       |

---

## 15. Ranking (`ranking.feature`) — 1 scenario

| ID          | Scenario                           | Tags  | Flow                                                                                                                     |
| ----------- | ---------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------ |
| **RANK-01** | Items in backlog, order changeable | `@P2` | Seed issue -> Seed second issue with "ZZZ" prefix -> Navigate to kanban -> Assert both cards visible in "Backlog" column |

---

## 16. Saved Views (`saved-views.feature`) — 2 scenarios

| ID          | Scenario                      | Tags  | Flow                                                                                                                                                                            |
| ----------- | ----------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **VIEW-01** | Create saved view with filter | `@P2` | Seed issue -> Navigate to kanban -> Create new board view "E2E Test View" -> Apply status filter "Backlog" -> Reload page -> Assert filter persists -> Assert view tab selected |
| **VIEW-02** | Switch between saved views    | `@P2` | Seed issue -> Navigate to kanban -> Switch to "Priority board" view -> Assert tab name -> Switch to "Backlog" view -> Assert tab name                                           |

---

## 17. Search (`search.feature`) — 1 scenario

| ID          | Scenario          | Tags  | Flow                                                                                                                                                                                                                                                |
| ----------- | ----------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SRCH-01** | Search by keyword | `@P1` | Seed issue -> Seed second issue with unique keyword in title -> Navigate to kanban -> Open filter bar -> Type keyword -> Save -> Wait for URL with keyword -> Assert heading visible -> Assert keyword issue card visible, seeded issue not visible |

---

## 18. Accessibility (`accessibility.feature`) — 3 scenarios

| ID          | Scenario                | Tags  | Flow                                                                                                          |
| ----------- | ----------------------- | ----- | ------------------------------------------------------------------------------------------------------------- |
| **A11Y-01** | Board kanban WCAG check | `@P2` | Seed issue -> Navigate to kanban -> Run axe scan -> Assert no critical violations except "nested-interactive" |
| **A11Y-02** | Issue detail WCAG check | `@P2` | Seed issue -> Navigate to issue page -> Run axe scan -> Assert no critical violations                         |
| **A11Y-03** | Table layout WCAG check | `@P2` | Seed issue -> Navigate to kanban -> Switch to table -> Run axe scan -> Assert no critical violations          |

---

## 19. Visual Regression (`visual.feature`) — 3 scenarios (excluded from full suite)

| ID         | Scenario                    | Tags          | Flow                                                                      |
| ---------- | --------------------------- | ------------- | ------------------------------------------------------------------------- |
| **VIS-01** | Board baseline match        | `@P2 @visual` | Seed issue -> Navigate to kanban -> Screenshot compare                    |
| **VIS-02** | Issue detail baseline match | `@P2 @visual` | Seed issue -> Navigate to issue page -> Screenshot compare                |
| **VIS-03** | Table layout baseline match | `@P2 @visual` | Seed issue -> Navigate to kanban -> Switch to table -> Screenshot compare |

---

## Failure Pattern Summary (from CI run #46)

The 9 failing tests all share a common pattern: **navigation to the kanban/board view times out** waiting for `heading level 2` to appear. The `waitForGitHubNavigation` helper waits for `.turbo-progress-bar` to hide (10s timeout), but the progress bar stays visible. This suggests GitHub's SPA navigation is not completing — either a rendering issue or the board view is slow to load in CI.

**Affected scenarios**: BRD-01, BRD-02, TBL-01, TBL-02, TBL-03, FLD-01, DRFT-01, DRFT-02, VIEW-02, RANK-01, SRCH-01, LBL-04

**Root cause hypothesis**: The `waitForGitHubNavigation` function in `src/utils/testing/wait-helpers.ts` waits for the turbo progress bar to hide, but GitHub's new SPA navigation may not trigger this bar consistently, or the board view rendering is delayed beyond the 10s timeout.

**Next steps for debugging**:

1. Increase timeout in `waitForGitHubNavigation` from 10s to 20s
2. Add explicit wait for board column headings after navigation
3. Consider using `networkidle` instead of just `domcontentloaded`
4. Check if GitHub changed their navigation mechanism recently
