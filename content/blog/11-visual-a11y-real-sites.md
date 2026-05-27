# So You Want to Screenshot GitHub: Visual Regression and WCAG on a Site You Don't Control

> **Part 11 of the Playwright E2E series.**
> [Part 1](/blog/01-why-real-websites.md) — Why real websites beat demo apps
> [Part 2](/architecture-tour) — Architecture of a production-grade E2E suite
> [Part 3](/fixtures-over-basetest) — Why fixtures over BaseTest
> [Part 4](/blog/04-authentication-without-2fa.md) — Authentication without the 2FA nightmare
> [Part 5](/blog/05-building-label-tests-with-ui-discovery.md) — Building E2E label tests with UI discovery
> [Part 6](/blog/06-assignees-milestones.md) — Assignees & Milestones: The Sidebar Pattern Pays Off
> [Part 7](/blog/07-real-world-e2e-gotchas.md) — 4 real-world E2E gotchas from GitHub Projects
> [Part 8](/blog/08-graphql-schema-archaeology.md) — GraphQL Schema Archaeology: Finding the Right Mutation
> [Part 9](/blog/09-scaling-playwright-cli-discovery.md) — From Single Click to Full Workflow: Scaling playwright-cli
> [Part 10](/blog/10-cicd-allure-caching-isolation.md) — CI/CD for the Paranoid QA

---

## The premise: 37 scenarios, zero non-functional gates

After Phase 6, we had a CI pipeline that ran 37 Gherkin scenarios against real GitHub Projects every Sunday morning. The tests verified that you could create issues, move them through a kanban board, label them, assign them, close them — the entire Jira-like lifecycle. They checked that the **functionality** worked.

What they didn't check:

| Gap                                             | Why it matters                                                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Does the board **look** right?                  | GitHub ships new CSS builds weekly. A layout regression could ship without us knowing.                                 |
| Are the pages **accessible**?                   | WCAG violations are invisible to functional assertions. A screen-reader user could lose access to the board overnight. |
| Do we even know when the **rendering** changes? | Functional tests pass as long as text is visible and buttons are clickable. Visual drift accumulates silently.         |

These aren't hypotheticals. In June 2025, GitHub rolled out a new project board layout that shifted column widths by 8px. Every functional test still passed — headings were still headings, buttons were still buttons. But the visual rhythm of the kanban was broken, and we had no signal.

Phase 7 closed that gap: **visual regression tests** with Playwright's built-in `toHaveScreenshot()`, and **WCAG accessibility checks** via `@axe-core/playwright`. Both running against the same real GitHub sandbox project. Both tagged `@P2` — manual trigger, not CI.

Here's what we learned.

---

## Part 1: Visual regression on a site you can't control

### The promise

Playwright's `toHaveScreenshot()` is deceptively simple:

```typescript
await expect(page.locator('.board')).toHaveScreenshot('board.png');
```

First run with `--update-snapshots` creates the baseline PNG in `visual-baselines/`. Subsequent runs compare pixel-by-pixel. If more than a configurable percentage of pixels differ, the test fails.

This is straightforward on a site you own. Your CSS classes are stable. Your content is deterministic. Your element dimensions don't change between test runs because your test data is fixed.

GitHub is the opposite.

### Problem 1: Everything is dynamic

GitHub's pages are living, breathing applications. Every page load injects:

- **Timestamps** that tick forward ("2 minutes ago" → "3 minutes ago")
- **Notification banners** that appear and disappear
- **Ads and promotional CTAs** in unauthenticated views
- **Hashed CSS class names** that change on every deploy (`Box-sc-g0xbh4-0 gWHNVC`)

If you take a full-page screenshot of `/github/project/1/views/1` and compare it against yesterday's baseline, you'll get thousands of pixel diffs — none of them meaningful. The board still works. The timestamps just updated.

The solution was obvious but worth stating explicitly: **screenshot elements, not pages**. Narrow the scope to regions that are structurally stable:

```typescript
// ❌ Full page — timestamps, banners, ads all change
await expect(page).toHaveScreenshot('full-board.png');

// ✅ Board columns only — structural layout, stable width
const boardArea = page.locator('[data-board-column]').first().locator('..');
await expect(boardArea).toHaveScreenshot('board-kanban-columns.png');
```

We picked three stable regions:

| Test         | Element                                | Why stable                                                                 |
| ------------ | -------------------------------------- | -------------------------------------------------------------------------- |
| Board kanban | `[data-board-column]` parent container | Fixed-width grid. Column widths don't change with card content.            |
| Table view   | `role="grid"`                          | Table layout has predetermined column widths. Seeded issue always one row. |
| Issue body   | `data-testid="issue-body-viewer"`      | Fixed-width markdown container. Body text seeded from a known template.    |

### Problem 2: Dimension mismatch is a hard fail

This one bit hard. Our initial VIS-02 scenario screenshotted the issue page header:

```typescript
const heading = page.getByRole('heading', { name: issueTitle, level: 1 });
const headerArea = heading.locator('..'); // parent <div>
await expect(headerArea).toHaveScreenshot('issue-header.png', {
  maxDiffPixelRatio: 0.1,
});
```

Here's what happened:

- **Baseline run:** Issue titled `e2e-1779868130115-vzcl` rendered at **457px × 48px**
- **Comparison run:** Issue titled `e2e-1779868455751-momv` rendered at **493px × 48px**
- **Result:** Hard fail. No pixel diff calculated.

Playwright's comparison logic works in two phases:

1. Check if dimensions match → **fail immediately if they don't**
2. Only then compute pixel diff ratio against `maxDiffPixelRatio`

The `maxDiffPixelRatio` tolerance never kicked in because the dimensions differed. The issue title is dynamic (timestamp + random suffix in the seeded fixture), and even though both titles have the same character count, sub-pixel anti-aliasing caused the parent `<div>` to wrap slightly differently.

The fix: **screenshot elements with fixed dimensions, not elements whose size depends on dynamic text**. We pivoted from the header `<div>` to the issue body viewer (`getByTestId('issue-body-viewer')`), which is a fixed-width markdown rendering container. The body content is seeded from a template, so while the unique run ID changes, the structural rendering is consistent.

Lesson: **`maxDiffPixelRatio` is not a tolerance for dimension changes. It's only a tolerance for pixel-level differences within identically-sized images.** If your element changes size, no threshold saves you.

### Problem 3: Baselines are source code

Visual baselines are binary assets that must be version-controlled. We put them in `visual-baselines/` — tracked by git, NOT in `.gitignore`. This means:

```bash
# First run: create baselines
npx playwright test --grep @visual --update-snapshots
git add visual-baselines/
git commit -m "feat: add visual regression baselines for board, issue, table"

# Subsequent runs: compare against committed baselines
npx playwright test --grep @visual
```

This creates a git-level audit trail of visual changes. If a developer intentionally redesigns the board, they update the baselines in the same PR:

```
feat: redesign kanban column headers
- visual-baselines/board-kanban-columns.png (updated)
```

Reviewers see a binary diff in the PR. No surprises.

But this also means baselines are **platform-specific**. Screenshots taken on macOS (darwin) will differ from Linux in CI (ubuntu) due to font rendering. We excluded visual tests from CI entirely:

```yaml
# e2e-full.yml (weekly CI — no visual)
run: npm run bddgen && npx playwright test --grep-invert @visual
```

Visual regression is a manual, local activity — triggered via `e2e-visual.yml` workflow or run directly. The CI gate is functional correctness, not pixel-perfect rendering across operating systems.

### The final visual test structure

```gherkin
@github @project @visual @P2
Feature: Visual Regression
  Background:
    Given a seeded project issue exists on the kanban board

  Scenario: VIS-01 — Board kanban view matches baseline
    When I navigate to the kanban view
    Then the board kanban columns should match the baseline

  Scenario: VIS-02 — Issue detail page body area matches baseline
    When I navigate to the issue page
    Then the issue body area should match the baseline

  Scenario: VIS-03 — Table layout view matches baseline
    When I navigate to the kanban view
    And I switch to the table layout view
    Then the table view grid should match the baseline
```

Three scenarios. Three stable elements. Zero CI headaches.

---

## Part 2: Accessibility as defense-in-depth

### The setup

`@axe-core/playwright` was already in our `devDependencies` — installed since Phase 1, never imported. It sat there like a gym membership purchased in January: paid for, unused, silently judging us.

The API is straightforward:

```typescript
import AxeBuilder from '@axe-core/playwright';

const results = await new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  .analyze();

console.log(results.violations); // [{ id, impact, help, nodes, helpUrl }]
```

We wrapped this in a utility (`src/utils/a11y.ts`) that:

- Runs WCAG A and AA analysis by default
- Fails on `critical` + `serious` violations
- Logs `moderate` + `minor` violations as warnings
- Accepts optional rule exclusions and CSS selectors to skip

### Problem 4: `testInfo` is not a Playwright fixture (in BDD)

Our first attempt tried to attach axe results to the Allure report via `testInfo.attach()`:

```typescript
// ❌ Does not work in playwright-bdd step definitions
Then('the page has no critical WCAG violations', async ({ page, testInfo }) => {
  const results = await new AxeBuilder({ page }).analyze();
  await testInfo.attach('axe-results', { body: JSON.stringify(results) });
});
```

Playwright's `testInfo` is usable in `test()` callbacks and fixture hooks — but in playwright-bdd step definitions, it's not recognized as a fixture. The generated spec file tried to inject it:

```javascript
test('A11Y-01', async ({ When, Then, page, testInfo }) => {
  await Then('the page has no critical WCAG violations', null, { page, testInfo });
});
```

And Playwright threw:

```
Test has unknown parameter "testInfo"
```

The fix: log violations to console instead of attaching to testInfo. Console output is captured by Playwright's reporter and appears in both HTML and Allure reports:

```typescript
console.log(`[a11y] ${results.violations.length} violation(s), ${results.passes.length} pass(es)`);
for (const v of results.violations) {
  console.warn(`[a11y:warn] ${v.impact}: ${v.help} (${v.id})`);
}
```

Lesson: **playwright-bdd's fixture injection is a subset of Playwright's. `testInfo` is a Playwright-internal parameter, not a user-facing fixture.** If you need it in steps, you need to explicitly register it as a custom fixture — or use console-based logging.

### Problem 5: GitHub has real WCAG violations

The board kanban view flagged one serious violation:

```
[a11y] 1 violation(s), 32 pass(es), 3 incomplete
[a11y:warn] serious: Interactive controls must not be nested (nested-interactive) — 2 nodes
```

The `nested-interactive` rule fires when a `<button>` or `<a>` is nested inside another interactive element. GitHub's draggable kanban cards are `<div role="button">` wrappers that contain inline action buttons. This is technically a WCAG violation — screen readers can get confused about which element receives focus.

But we can't fix GitHub. This is a **third-party false positive** — a real violation, but not one we control.

The pragmatic solution: disable the specific rule for the board view. Our feature file gained an "except" variant:

```gherkin
Scenario: A11Y-01 — Board kanban view has no critical WCAG violations
  When I navigate to the kanban view
  Then the page has no critical WCAG violations except "nested-interactive"
```

The step definition accepts the rule name and passes it to `AxeBuilder.disableRules()`:

```typescript
Then(
  'the page has no critical WCAG violations except {string}',
  async ({ page }, disabledRule: string) => {
    await runA11y(page, { disableRules: [disabledRule] });
  },
);
```

This keeps the test **useful**: if GitHub introduces a NEW violation on the board page, it still fails. We're only suppressing one known, unactionable false positive.

### The final a11y test structure

```gherkin
@github @project @a11y @P2
Feature: Accessibility Checks (WCAG)
  Background:
    Given a seeded project issue exists on the kanban board

  Scenario: A11Y-01 — Board kanban view has no critical WCAG violations
    When I navigate to the kanban view
    Then the page has no critical WCAG violations except "nested-interactive"

  Scenario: A11Y-02 — Issue detail page has no critical WCAG violations
    When I navigate to the issue page
    Then the page has no critical WCAG violations

  Scenario: A11Y-03 — Table layout view has no critical WCAG violations
    When I navigate to the kanban view
    And I switch to the table layout view
    Then the page has no critical WCAG violations
```

### The axe results in practice

| Page         | Violations       | Passes | Incomplete | Verdict |
| ------------ | ---------------- | ------ | ---------- | ------- |
| Board kanban | 0 (1 suppressed) | 31     | 3          | Pass    |
| Issue detail | 0                | 30     | 3          | Pass    |
| Table view   | 0                | 31     | 3          | Pass    |

The `incomplete` counts (3 per page) represent elements that axe-core couldn't fully evaluate — typically color-contrast checks that require manual review. These are non-failing by design.

---

## Part 3: The architecture decisions that mattered

### Why dedicated feature files, not inline tags

We considered tagging existing functional scenarios with `@a11y` to piggyback on their navigation:

```gherkin
# Option A: inline tagging (rejected)
@a11y
Scenario: ISS-01 — Create issue via API and verify it appears on the board
  Given a seeded project issue exists on the kanban board
  When I navigate to the issue page
  Then I should see the issue heading  ← functional
  And the page has no critical WCAG violations  ← a11y
```

We rejected this for two reasons:

1. **Failure isolation**. If ISS-01 passes functionally but fails a11y, the report says "ISS-01 failed." Is it a code regression or a WCAG regression? You can't tell without reading the full trace.
2. **Tag granularity**. Inline tagging means you can't run "all a11y tests" without also running their functional companions. A dedicated `@a11y` feature gives you clean separation: `npx playwright test --grep @a11y` runs three tests, not thirty-seven.

### Why visual baselines live in git

Alternative architectures:

- **S3 bucket with timestamped baselines**: More CI-friendly, but loses git's review workflow. You can't see a visual diff in a PR.
- **Per-developer baselines**: Too fragile. Baselines must be identical across the team.
- **Generated in CI, compared against previous CI run**: Requires persistent storage, adds infrastructure complexity.

Committing baselines to git is the simplest solution that works for a small team. When we scale to multi-browser (firefox, webkit), we'll add `{platform}` to the snapshot path template:

```typescript
snapshotPathTemplate: '{snapshotDir}/{testFileName}/{arg}-{platform}{ext}';
// Produces: board-kanban-columns-darwin.png, board-kanban-columns-linux.png
```

### Why we don't fail on `moderate` and `minor` violations

WCAG categorizes violations into four impact levels. Failing on all four means your CI gate closes on color-contrast nitpicks while your team is trying to ship a hotfix. Our severity mapping:

| Impact     | Behavior | Rationale                                                     |
| ---------- | -------- | ------------------------------------------------------------- |
| `critical` | **Fail** | Screen-reader users are completely blocked                    |
| `serious`  | **Fail** | Major usability barrier (nested interactives, missing labels) |
| `moderate` | **Warn** | Usability impact, but content remains accessible              |
| `minor`    | **Warn** | Best-practice violations with minimal impact                  |

If you want all four to fail, set `A11Y_STRICT=true` in your `.env` — the utility reads it and expands `failOn`.

---

## The roadmap: what's left

Phase 7 closes two of the four remaining roadmap items:

| Item                            | Phase 7          | Remaining |
| ------------------------------- | ---------------- | --------- |
| Visual regression tests         | ✅ VIS-01/02/03  | —         |
| Accessibility checks (WCAG)     | ✅ A11Y-01/02/03 | —         |
| GitHub Actions CI/CD pipeline   | ✅ Phase 6       | —         |
| Multi-browser (firefox, webkit) | —                | Phase 8   |

Multi-browser is the logical next step. Visual baselines are already structured to support per-platform snapshots. The axe-core results are browser-agnostic (WCAG violations are DOM-based, not rendering-based). Adding two more browser projects to `playwright.bdd.config.ts` and running the suite across chromium + firefox + webkit will close the last checkbox.

But that's a story for Part 12.

---

**Key takeaways:**

1. **Screenshot elements, not pages** — on dynamic sites, narrow the scope to structurally stable regions. If the element changes size with content, find a different element.
2. **`maxDiffPixelRatio` ≠ dimension tolerance** — Playwright rejects dimension mismatches before computing pixel diffs. No threshold setting prevents this.
3. **`testInfo` is not a BDD fixture** — playwright-bdd's fixture system doesn't include Playwright's internal `testInfo` parameter. Console-based logging works with any reporter.
4. **Suppress third-party false positives explicitly** — use rule exclusions in your Gherkin steps so that tests fail on NEW violations but pass on known unactionable ones.
5. **Commit baselines to git, compare locally** — visual regression doesn't belong in CI when you're testing a third-party site. Keep it as a manual quality gate.

---

_Previously: [Part 10 — CI/CD for the Paranoid QA](/blog/10-cicd-allure-caching-isolation.md)_
