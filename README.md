# Playwright E2E Testing — Real-World Best Practices

[![Playwright](https://img.shields.io/badge/playwright-v1.59-blue)](https://playwright.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue)](https://www.typescriptlang.org/)
[![BDD](https://img.shields.io/badge/BDD-playwright--bdd-green)](https://github.com/vitalets/playwright-bdd)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

> **A production-grade Playwright E2E testing repository demonstrating QA best practices by testing real public websites — the kind of complexity demo apps hide from you.**

This repo is both a **reference architecture** and a **QA blog series**. Every pattern here solves a real problem QA engineers face: hashed CSS classes, rate limiting, GraphQL APIs, auth state management, and parallel-safe data lifecycle.

## ✨ What's Inside

- **Issue CRUD** — create, update, close, reopen issues via API + UI verification
- **Board Workflow (Kanban)** — move items between columns, backward moves, drag-and-drop
- **Labels & Metadata** — add/remove labels via UI, multi-label, board filtering
- **Assignees & Milestones** — assign/unassign users, create milestones, track progress
- **Table & Views** — switch layouts, column sorting, table filtering
- **Comments** — add/edit comments via API, verify in timeline
- **Bulk Operations** — batch status updates via API, verify in UI
- **In-Project Search** — keyword search through filter bar
- **Page Object Model** with role-based locators — resilient against DOM changes on 3rd-party sites
- **BDD with Gherkin** via `playwright-bdd` — executable specs for business-readable test flows
- **Data lifecycle** — auto-seed before tests, guaranteed auto-cleanup after (even on failure)
- **Custom fixtures** — authenticated + anonymous contexts, page object injection, shared sandbox resources
- **API + UI hybrid** — seed data via REST + GraphQL API, verify via browser
- **GraphQL client** — typed wrapper for GitHub Projects V2 (boards, fields, items, workflows)
- **GitHub project management** as the demo target — mirrors Jira/Linear/Asana test patterns

## 🎯 Focus: One Target, Deep Coverage

We test **GitHub** exclusively — specifically GitHub project management workflows. Single target lets us go deep on patterns that transfer to any modern project tracker:

| Pattern               | Why It Matters                                        |
| --------------------- | ----------------------------------------------------- |
| Role-based locators   | Production CSS classes change on every deploy         |
| API seed + UI verify  | Fast, deterministic test data without UI flakiness    |
| GraphQL mutations     | Projects V2 has no REST API — a real-world constraint |
| Persistent sandbox    | Avoids rate limits; shared context across all tests   |
| Parallel-safe cleanup | Unique test names so sharded runs don't collide       |

## 🚀 Quick Start

```bash
git clone https://github.com/mihaamiharu/playwright-e2e.git
cd playwright-e2e
npm install
npx playwright install --with-deps chromium
npm test
```

### Authenticated Tests

Most tests in this project require GitHub authentication. Set up a dedicated test account:

```bash
cp .env.example .env
# Edit .env — fill in GITHUB_USERNAME, GITHUB_PASSWORD, and GITHUB_API_TOKEN
```

The `.env` file is gitignored — never commit credentials.

## 🧪 Running Tests

```bash
# All tests (headless chromium)
npm test

# Headed — see the browser
npm run test:headed

# Playwright UI mode — interactive debugging
npm run test:ui

# Run only BDD tests (Gherkin features)
npm run test:bdd

# BDD tests headed
npm run test:bdd:headed

# Generate + view HTML report
npm run report

# Generate + view Allure report
npm run report:allure

# Type check + lint + format
npm run typecheck
npm run lint
npm run format:check
```

## 📂 Project Structure

```
playwright-e2e/
├── docs/                    # TEST-PLAN.md, ARCHITECTURE.md — read these first
├── features/                # Gherkin .feature files
│   └── github/
│       ├── login.feature
│       ├── issue-crud.feature
│       ├── board-workflow.feature
│       ├── labels.feature
│       ├── assignees.feature
│       ├── milestones.feature
│       ├── table-views.feature
│       ├── comments.feature
│       ├── bulk-operations.feature
│       └── search.feature
├── steps/                   # Step definitions (BDD)
│   └── github/
│       ├── login.steps.ts
│       ├── issue-crud.steps.ts
│       ├── board-workflow.steps.ts
│       ├── labels.steps.ts
│       ├── assignees.steps.ts
│       ├── milestones.steps.ts
│       ├── table-views.steps.ts
│       ├── comments.steps.ts
│       ├── bulk-operations.steps.ts
│       └── search.steps.ts
├── src/
│   ├── pages/               # Page Object Models
│   │   └── github/
│   │       └── LoginPage.ts
│   ├── fixtures/            # Custom test fixtures (auto-setup/teardown)
│   │   ├── github.fixture.ts
│   │   ├── github-project.fixture.ts
│   │   └── data-lifecycle.fixture.ts
│   ├── utils/               # DataManager, REST client, GraphQL client, Auth helper
│   │   ├── data-manager.ts
│   │   ├── api-client.ts
│   │   ├── github-projects-api.ts
│   │   └── github-auth.ts
│   └── config/              # playwright config, env config, global setup
│       ├── global-setup.ts
│       └── env.config.ts
├── auth/                    # Storage state — gitignored
├── content/                 # Blog posts, diagrams, video scripts
│   └── blog/
└── .features-gen/           # BDD generated code — gitignored
```

## 📖 Documentation

- **[TEST-PLAN.md](./docs/TEST-PLAN.md)** — Full test strategy: 37 scenarios across Issue CRUD, Labels, Milestones, Kanban, Custom Fields, Bulk Operations, and Workflows. 24 currently automated.
- **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — Design decisions: why fixtures over BaseTest, why persistent sandbox, data lifecycle guarantees, dependency version policy

## 📝 Blog Series

This repository is part of a QA engineering blog series:

1. **[Why Your Playwright Tests Need Real Websites (Not Demo Apps)](./content/blog/01-why-real-websites.md)** — The demo app trap, hashed CSS classes, and why production targets make better testers
2. **[Architecture Tour](./content/architecture-tour.md)** — How this repo is built: fixtures, POMs, data lifecycle
3. **[Fixtures Over BaseTest](./content/fixtures-over-basetest.md)** — Playwright's fixture system vs traditional OOP test patterns
4. **[Authentication Without the 2FA Nightmare](./content/blog/04-authentication-without-2fa.md)** — Device verification, IMAP polling, and the two-credential pattern
5. **[Building E2E Label Tests: From Gherkin to Green](./content/blog/05-building-label-tests-with-ui-discovery.md)** — Discovering GitHub's label picker UI with playwright-cli, auth refactor, and 4 bugs caught in implementation
6. **[Assignees & Milestones: The Sidebar Pattern Pays Off](./content/blog/06-assignees-milestones.md)** — Reusing the dialog pattern across metadata fields, 5 scenarios in one session
7. **[When the DOM Fights Back: 4 Real-World E2E Gotchas from GitHub Projects](./content/blog/07-real-world-e2e-gotchas.md)** — Substring matching, filter bar limitations, backdrop overlays, and parallel BDD pitfalls
8. **[GraphQL Schema Archaeology: Finding the Right Mutation](./content/blog/08-graphql-schema-archaeology.md)** — Introspecting GitHub's GraphQL schema to discover undocumented mutations, nested input types, and union response handling
9. **[From Single Click to Full Workflow: Scaling playwright-cli](./content/blog/09-scaling-playwright-cli-discovery.md)** — Multi-step UI flow discovery for saved views: creating views, applying filters, renaming, and verifying persistence

## 🛠️ Tech Stack

| Tool              | Purpose                         |
| ----------------- | ------------------------------- |
| Playwright v1.59  | Browser automation + assertions |
| TypeScript 6.0    | Type-safe test code             |
| playwright-bdd    | Gherkin → executable tests      |
| Allure            | Rich test reports with history  |
| ESLint + Prettier | Code quality + formatting       |
| dotenv            | Credential management           |

## 🗺️ Roadmap

- [x] Playwright + TypeScript scaffold
- [x] BDD with login feature
- [x] Data lifecycle (seed → verify → auto-cleanup)
- [x] REST + GraphQL API clients
- [x] Persistent sandbox fixture
- [x] Project management test plan
- [x] Issue CRUD lifecycle (ISS-01–04)
- [x] Board workflow kanban tests (BRD-01–04)
- [x] Labels & metadata (LBL-01–04)
- [x] Assignees & milestones (ASN-01–03, MIL-01–02)
- [x] Table views, comments, bulk ops & search (TBL-01–03, CMT-01–02, BULK-01, SRCH-01)
- [x] Custom fields, milestones, draft items, archive, date fields, saved views, ranking, auto-workflows (Phase 5 — 37/37 automated)
- [ ] GitHub Actions CI/CD pipeline
- [ ] Visual regression tests
- [ ] Accessibility checks (WCAG)
- [ ] Multi-browser (firefox, webkit)

## 🤝 Contributing

This is a personal educational project, but issues and suggestions are welcome. PRs should follow the conventional commit format (`feat:`, `fix:`, `docs:`, `chore:`) and target `main` via a feature branch.

## 📄 License

MIT — see [LICENSE](./LICENSE) for details.

---

**Built for QA engineers who want their test suites to survive the real world.**
