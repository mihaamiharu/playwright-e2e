# Changelog

## v0.1.0 — 2026-05-27

### Phase 1: Foundation

- Playwright + TypeScript scaffold with BDD (`playwright-bdd`)
- GitHub login flow with device verification bypass (IMAP polling)
- Data lifecycle: seed → verify → auto-cleanup via `DataManager` (LIFO queue)
- Persistent sandbox project fixture with shared context

### Phase 2: API Layer

- REST API client (`GitHubAPI`) — typed wrapper for GitHub Issues
- GraphQL client (`GitHubProjectsAPI`) — typed wrapper for Projects V2
- Authenticated + anonymous fixture composition via `mergeTests`

### Phase 3: Issue CRUD & Board Workflow

- ISS-01–04: Create, read, update, close/reopen issues via API + UI verification
- BRD-01–04: Kanban board navigation, drag-and-drop card moves, column status verification
- Page Object Models with role-based locators (no CSS selectors)

### Phase 4: Labels, Metadata & Views

- LBL-01–04: Add/remove labels via UI, multi-label, board filtering
- ASN-01–03: Assign/unassign users, filter by assignee
- MIL-01–02: Create milestones, link issues, verify sidebar metadata
- TBL-01–03: Table layout, column sorting, filter visibility
- CMT-01–02: Add/edit comments via API, verify in timeline
- BULK-01: Batch status updates via API
- SRCH-01: In-project keyword search through filter bar

### Phase 5: Advanced Scenarios

- Custom fields (SingleSelect, Date, Iteration, Text, Number)
- Draft items and issue conversion
- Date & iteration field verification
- Saved views (create, rename, filter, switch, persist)
- Archive/restore, ranking, auto-workflows

### Phase 6: CI/CD Pipelines

- `ci.yml` — PR/push: typecheck, lint, format check, BDD generation
- `e2e-full.yml` — Weekly + manual: full suite, Allure report to GitHub Pages
- `e2e-debug.yml` — Manual: filtered by Gherkin tag, configurable trace/video
- `e2e-visual.yml` — Manual: `@visual` tag only
- Rerun-failed-only — auto-detects `github.run_attempt > 1`, runs `--last-failed`

### Phase 7: Visual & Accessibility

- Visual regression snapshots (`maxDiffPixelRatio: 0.05`)
- WCAG A/AA checks via axe-core (`src/utils/accessibility/a11y.ts`)
- AI CAPTCHA solver (Gemini) for GitHub auth challenges
- ScenarioContext — per-test key-value store for BDD step state sharing
