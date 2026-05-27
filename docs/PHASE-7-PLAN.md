# Phase 7 Implementation Plan

> Visual regression + accessibility checks — 6 scenarios across 2 groups.

## Status Legend

- [ ] Not started
- [~] In progress
- [x] Complete

## Overall Status: **COMPLETE** ✅ (43/43 scenarios)

## Design Decisions

| Decision           | Choice                      | Rationale                                                                                                                                                      |
| ------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Screenshot scope   | Element-level               | Avoid full-page noise from GitHub's dynamic content (timestamps, ads, notification banners). Specific stable regions: board columns, issue header, table grid. |
| A11y architecture  | Dedicated feature file      | Cleaner BDD reporting. Separate `@a11y` tag enables selective execution without mixing functional failures with WCAG failures.                                 |
| Violation severity | `critical` + `serious` fail | Configurable via `A11Y_STRICT` env var. `moderate` + `minor` log warnings. Results attached to Allure as JSON.                                                 |
| Visual in CI       | Excluded                    | `@visual` tag → `--grep-invert @visual` in CI workflow. Baselines committed to git, compared locally.                                                          |

## Pre-work

- [x] Verified `@axe-core/playwright ^4.11.0` already in devDependencies
- [x] Playwright `toHaveScreenshot()` built-in — no extra deps needed

## Groups

### Group 1: Accessibility (A11Y-01–03 P2)

- [x] New: `src/utils/a11y.ts` — `runA11y(page, testInfo, options?)` wraps `AxeBuilder`
- [x] New: `features/github/accessibility.feature`
- [x] New: `steps/github/accessibility.steps.ts`
- A11Y-01: Board kanban view → run axe → assert no critical violations
- A11Y-02: Issue detail page → run axe → assert no critical violations
- A11Y-03: Table layout view → run axe → assert no critical violations

### Group 2: Visual Regression (VIS-01–03 P2)

- [x] New: `features/github/visual.feature`
- [x] New: `steps/github/visual.steps.ts`
- VIS-01: Board kanban columns → `toHaveScreenshot('board-kanban-columns.png')`
- VIS-02: Issue page header → `toHaveScreenshot('issue-page-header.png')`
- VIS-03: Table view grid → `toHaveScreenshot('table-view-grid.png')`

## Config Changes

- [x] `playwright.bdd.config.ts`: Added `snapshotDir: 'visual-baselines'`, `snapshotPathTemplate`, `expect.toHaveScreenshot.maxDiffPixelRatio: 0.05`
- [x] `.github/workflows/e2e-full.yml`: Exclude `@visual` tag

## Docs Update

- [x] README.md — check off visual regression + accessibility checks
- [x] TEST-PLAN.md — added VIS-01–03 + A11Y-01–03, updated coverage table, lifecycle, implementation sequence

## File Manifest

### New Files

| File                                    | Group         |
| --------------------------------------- | ------------- |
| `docs/PHASE-7-PLAN.md`                  | This file     |
| `src/utils/a11y.ts`                     | 1             |
| `features/github/accessibility.feature` | 1             |
| `steps/github/accessibility.steps.ts`   | 1             |
| `features/github/visual.feature`        | 2             |
| `steps/github/visual.steps.ts`          | 2             |
| `visual-baselines/*.png`                | 2 (generated) |

### Modified Files

| File                             | What                                                             |
| -------------------------------- | ---------------------------------------------------------------- |
| `playwright.bdd.config.ts`       | `snapshotDir`, `snapshotPathTemplate`, `expect.toHaveScreenshot` |
| `.github/workflows/e2e-full.yml` | Exclude `@visual` from scheduled suite                           |
| `README.md`                      | Roadmap: check off visual + a11y                                 |
| `docs/TEST-PLAN.md`              | Sections 17+18, coverage table, lifecycle                        |
