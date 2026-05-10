# Playwright E2E Testing — Real-World Best Practices

[![CI](https://github.com/mihaamiharu/playwright-e2e/actions/workflows/e2e-tests.yml/badge.svg)](https://github.com/mihaamiharu/playwright-e2e/actions)
[![Playwright](https://img.shields.io/badge/playwright-v1.52-blue)](https://playwright.dev)

> **Testing real websites, the right way.**

A production-grade Playwright E2E testing repository that demonstrates QA best practices
by testing **real public websites** (GitHub, Wikipedia, Hacker News) — the kind of
complexity demo apps hide from you.

## ✨ What's Inside

- **Page Object Model** — resilient, role-based locators for production DOM
- **BDD with Gherkin** — executable specs via `playwright-bdd`
- **Data lifecycle** — auto-seed before tests, auto-cleanup after (always, even on failure)
- **Custom fixtures** — authenticated + anonymous contexts, page object injection
- **API + UI hybrid** — seed data via REST API, verify via browser
- **Visual regression** — screenshot comparison with dynamic content masking
- **Accessibility testing** — WCAG checks with `@axe-core/playwright`
- **CI/CD** — GitHub Actions with sharding, scheduled runs, artifact reports

## 🚀 Quick Start

```bash
git clone https://github.com/mihaamiharu/playwright-e2e.git
cd playwright-e2e
npm install
npx playwright install --with-deps chromium
cp .env.example .env   # optional — only needed for authenticated tests
npm test
```

## 📖 Blog Series

This repo is part of a blog series for QA automation engineers.
[Read the series →](#) (coming soon)

## 📂 Project Structure

```
playwright-e2e/
├── docs/                  # Test plan, architecture decisions
├── features/              # Gherkin .feature files (executable specs)
├── steps/                 # Step definitions (BDD)
├── tests/                 # Pure Playwright tests (E2E, API, visual, a11y)
├── src/
│   ├── pages/             # Page Object Models
│   ├── components/        # Reusable UI components
│   ├── fixtures/          # Custom test fixtures (auto-setup/teardown)
│   ├── utils/             # Data manager, API client, helpers
│   ├── data/              # Test data
│   └── config/            # Playwright config, env config
├── auth/                  # Storage state (gitignored)
├── content/               # Blog posts, diagrams, video scripts
└── .github/workflows/     # CI/CD pipeline
```

## 🧪 Running Tests

```bash
# All E2E tests (3 browsers)
npm test

# Headed — see the browser
npm run test:headed

# Playwright UI mode — interactive debugging
npm run test:ui

# Smoke tests only (@smoke tag)
npm run test:smoke

# BDD tests (Gherkin features)
npm run test:bdd     # coming in Phase 2

# View HTML report
npm run report
```

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md)

## 📄 License

MIT
