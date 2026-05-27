# Phase 5 Implementation Plan

> 13 scenarios across 7 groups. Build order based on dependencies and priority.

## Status Legend

- [ ] Not started
- [~] In progress
- [x] Complete

## Overall Status: **COMPLETE** ✅ (37/37 scenarios)

## Pre-work

- [x] **Phase 0** — Research: query sandbox for existing fields, iterations, workflows
- [x] **Phase 1** — Expand GraphQL API (`github-projects-api.ts`): `setFieldValue`, `archiveItem`, `unarchiveItem`, `addDraftIssue`, `convertDraftToIssue`, `getRepositoryId`, enhanced `getItems`
- [x] **Phase 2** — Sandbox setup script (`src/scripts/setup-sandbox.ts`): ensure custom fields + auto-workflow exist

## Groups (in build order)

### Group 3: Archive (ARC-01 P2, ARC-02 P2)

- [x] New: `features/github/archive.feature`
- [x] New: `steps/github/archive.steps.ts`
- ARC-01: Seed issue → archive via API → navigate → verify not visible
- ARC-02: Seed → archive → unarchive → navigate → verify visible

### Group 6: Close Milestone (MIL-03 P2)

- [x] Add to: `features/github/milestones.feature`
- [x] Add to: `steps/github/milestones.steps.ts`
- [x] Add `updateMilestone()` to `api-client.ts`
- Close milestone → verify "Closed" + progress at 100%

### Group 1: Custom Fields (FLD-01 P1, FLD-02 P2) — **highest priority**

- [x] New: `features/github/custom-fields.feature`
- [x] New: `steps/github/custom-fields.steps.ts`
- Depends: Phase 1 (`setFieldValue`) + Phase 2 (custom fields exist)
- FLD-01: Set Priority="P0" → verify in table view
- FLD-02: Two issues, different Priority → filter → only matching visible

### Group 4: Date & Iteration (TDATE-01 P2, ITER-01 P2)

- [x] New: `features/github/date-iteration.feature`
- [x] New: `steps/github/date-iteration.steps.ts`
- TDATE-01: Set "Target date" → verify in table view
- ITER-01: ✅ Set "Iteration" → verify on board card (field created via API)

### Group 5: Draft Items (DRFT-01 P2, DRFT-02 P2)

- [x] New: `features/github/draft-items.feature`
- [x] New: `steps/github/draft-items.steps.ts`
- Needs: `addDraftIssue`, `getRepositoryId` (convert via REST + add to project since GraphQL mutation is unreliable)

### Group 7: Saved Views (VIEW-01 P2, VIEW-02 P2) — playwright-cli discovery

- [x] playwright-cli locator discovery
- [x] New: `features/github/saved-views.feature`
- [x] New: `steps/github/saved-views.steps.ts`

### Group 8: Ranking (RANK-01 P2)

- [x] New: `features/github/ranking.feature`
- [x] New: `steps/github/ranking.steps.ts`
- Items appear in backlog column (drag-and-drop deferred)

### Group 9: Auto-Workflows (WFLOW-01 P2)

- [x] New: `features/github/auto-workflows.feature`
- [x] New: `steps/github/auto-workflows.steps.ts`
- Depends: Phase 2 (workflow pre-configured — "Item closed" workflow exists)

## Docs Update (final step)

- [x] TEST-PLAN.md — mark all 13 scenarios as ✅
- [x] README.md — update roadmap

## File Manifest

### New Files

| File                                     | Groups    |
| ---------------------------------------- | --------- |
| `docs/PHASE-5-PLAN.md`                   | This file |
| `src/scripts/setup-sandbox.ts`           | Phase 2   |
| `features/github/archive.feature`        | 3         |
| `steps/github/archive.steps.ts`          | 3         |
| `features/github/custom-fields.feature`  | 1         |
| `steps/github/custom-fields.steps.ts`    | 1         |
| `features/github/date-iteration.feature` | 4         |
| `steps/github/date-iteration.steps.ts`   | 4         |
| `features/github/draft-items.feature`    | 5         |
| `steps/github/draft-items.steps.ts`      | 5         |
| `features/github/saved-views.feature`    | 7         |
| `steps/github/saved-views.steps.ts`      | 7         |
| `features/github/ranking.feature`        | 8         |
| `steps/github/ranking.steps.ts`          | 8         |
| `features/github/auto-workflows.feature` | 9         |
| `steps/github/auto-workflows.steps.ts`   | 9         |

### Modified Files

| File                                 | What                  |
| ------------------------------------ | --------------------- |
| `src/utils/github-projects-api.ts`   | 6 new GraphQL methods |
| `src/utils/api-client.ts`            | `updateMilestone()`   |
| `features/github/milestones.feature` | MIL-03 scenario       |
| `steps/github/milestones.steps.ts`   | MIL-03 steps          |
| `docs/TEST-PLAN.md`                  | Status updates        |
| `README.md`                          | Roadmap update        |
