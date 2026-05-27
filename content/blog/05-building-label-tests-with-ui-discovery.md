# Building E2E Label Tests: From Gherkin to Green

> **Part 5 of the Playwright E2E series.**
> [Part 1](/blog/01-why-real-websites.md) — Why real websites beat demo apps
> [Part 2](/architecture-tour) — Architecture of a production-grade E2E suite
> [Part 3](/fixtures-over-basetest) — Why fixtures over BaseTest
> [Part 4](/blog/04-authentication-without-2fa.md) — Authentication without the 2FA nightmare

---

## The problem: four label scenarios, zero known locators

After building the board workflow tests, the next target in our test plan was **Labels & Metadata** — four P1 scenarios:

| ID     | Scenario                                                            |
| ------ | ------------------------------------------------------------------- |
| LBL-01 | Add a label to an issue via the UI, verify it renders               |
| LBL-02 | Add multiple labels via the UI, verify all render                   |
| LBL-03 | Remove a label via the UI, verify it disappears                     |
| LBL-04 | Filter the kanban board by label, verify only matching items appear |

The data lifecycle was already proven — our `github-project.fixture.ts` could seed issues, add them to the project board, and auto-clean up. The API layer had `addLabels()` and `removeLabel()` ready to go. The question was: **how do we interact with GitHub's label picker UI?**

GitHub's codebase ships hashed CSS classes on every deploy. You can't inspect the DOM and write `page.locator('.label-picker-dropdown-v3')`. You need to discover the **role-based locators** that the ARIA tree exposes — and the only way to discover them is to open a live browser and navigate the page.

Enter `playwright-cli`.

---

## The discovery session

### Step 1: Open a real issue with a real label

We created a temporary issue on the test repo with a `bug` label via the API, loaded our auth state, and opened it in playwright-cli:

```bash
playwright-cli open
playwright-cli state-load auth/github.json
playwright-cli goto https://github.com/mihaamiharu/playwright-e2e/issues/122
playwright-cli snapshot
```

The snapshot revealed the sidebar structure. The label section's key element:

```yaml
- heading "Labels" [level=3]
- button "Edit Labels" [ref=e290] [cursor=pointer]
```

`button "Edit Labels"` — that's a pure role-based locator. No CSS classes, no XPath, nothing that will break on the next deploy.

### Step 2: Open the label picker

```bash
playwright-cli click "getByRole('button', { name: 'Edit Labels' })"
playwright-cli snapshot
```

The picker appeared as a dialog:

```yaml
- dialog "Apply labels to this issue" [ref=e541]:
    - heading "Apply labels to this issue" [level=1]
    - combobox "Filter labels" [expanded]
    - listbox "Label results":
        - group "Selected labels":
            - option "bug" [selected]
        - group "Suggestions":
            - option "documentation"
            - option "enhancement"
            - option "help wanted"
            - ...
```

Two groups of labels: **Selected** (currently applied) and **Suggestions** (available). Each label is an `option` with the label name.

### Step 3: Toggle a label

```bash
# Add "enhancement"
playwright-cli click "getByRole('option', { name: 'enhancement' })"

# Press Escape to dismiss
playwright-cli press Escape
```

After dismissing, the sidebar updated:

```yaml
- link "bug Something isn't working"
- link "enhancement New feature or request"
```

The labels appear as `link` elements with the format `<name> <description>`. To verify a label exists on the issue page, we use `page.getByRole('link', { name: new RegExp(label) })`.

### Step 4: Remove a label

Opening the picker again and clicking the `[selected]` option deselects it:

```bash
playwright-cli click "getByRole('button', { name: 'Edit Labels' })"
playwright-cli click "getByRole('dialog', { name: 'Apply labels to this issue' }).getByRole('option', { name: 'bug' })"
playwright-cli press Escape
```

The "bug" link vanished from the sidebar. The same `option` click works for both selecting and deselecting — it's a toggle.

### Step 5: Explore the board label filter (LBL-04)

Navigating to the kanban view, the filter bar revealed:

```yaml
- region "View filters":
    - form "Filter":
        - combobox "Filter"
```

Clicking the combobox showed filter types as options. Selecting "Label" opened a sub-menu with actual labels:

```bash
playwright-cli click "getByRole('combobox', { name: 'Filter' })"
playwright-cli click "getByRole('option', { name: 'Label, Filter, Filter by label' })"
```

The sub-menu listed labels like `option "enhancement, Label"` and `option "bug, Label"`. After selecting one and clicking "Save", the URL changed to `?filterQuery=label%3Abug`.

---

## From CLI session to step definitions

With every locator discovered, we wrote the step definitions in `steps/github/labels.steps.ts`:

```typescript
When('I add the label {string} via the UI', async ({ page }, label: string) => {
  await page.getByRole('button', { name: 'Edit Labels' }).click();

  const dialog = page.getByRole('dialog', { name: 'Apply labels to this issue' });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('option', { name: label }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

When('I remove the label {string} via the UI', async ({ page }, label: string) => {
  await page.getByRole('button', { name: 'Edit Labels' }).click();

  const dialog = page.getByRole('dialog', { name: 'Apply labels to this issue' });
  await expect(dialog).toBeVisible();

  // Same click — toggles selected/deselected
  await dialog.getByRole('option', { name: label }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
```

The full locator table:

| UI Element                 | Locator                                                           |
| -------------------------- | ----------------------------------------------------------------- |
| Open label picker          | `getByRole('button', { name: 'Edit Labels' })`                    |
| Label picker dialog        | `getByRole('dialog', { name: 'Apply labels to this issue' })`     |
| Select/deselect label      | `dialog.getByRole('option', { name: label })`                     |
| Dismiss picker             | `page.keyboard.press('Escape')`                                   |
| Verify label on issue      | `getByRole('link', { name: new RegExp(label) })`                  |
| Board filter combobox      | `getByRole('combobox', { name: 'Filter' })`                       |
| Select "Label" filter type | `getByRole('option', { name: 'Label, Filter, Filter by label' })` |
| Select specific label      | `getByRole('option', { name: 'bug, Label' })`                     |
| Apply filter               | `getByRole('button', { name: 'Save' })`                           |
| Board card                 | `getByRole('button', { name: new RegExp(title) })`                |

The 4 Gherkin scenarios that use these steps:

```gherkin
Scenario: LBL-01 — Add label via UI and verify it renders
  Given a seeded project issue exists on the kanban board
  When I navigate to the issue page
  And I add the label "bug" via the UI
  Then I should see the "bug" label on the issue

Scenario: LBL-02 — Add multiple labels via UI and verify all render
  When I navigate to the issue page
  And I add the label "bug" via the UI
  And I add the label "enhancement" via the UI
  Then I should see the "bug" label on the issue
  And I should see the "enhancement" label on the issue

Scenario: LBL-03 — Remove label via UI and verify it disappears
  When I add the label "bug" via the API
  And I navigate to the issue page
  And I remove the label "bug" via the UI
  Then I should not see the "bug" label on the issue

Scenario: LBL-04 — Filter board by label, verify matching only
  When I add the label "bug" via the API
  And I seed a second unlabeled issue on the board
  And I navigate to the kanban view
  And I filter the board by the label "bug"
  Then the seeded issue should be visible on the board
  And the second unlabeled issue should not be visible on the board
```

---

## The side quest: auth duplication cleanup

While implementing the labels tests, we noticed the same cookie-loading code duplicated in two places:

```typescript
// In issue-crud.steps.ts AND board-workflow.steps.ts:
const AUTH_PATH = path.resolve('auth/github.json');
try {
  const raw = fs.readFileSync(AUTH_PATH, 'utf-8');
  const { cookies } = JSON.parse(raw);
  if (cookies?.length) {
    await page.context().addCookies(cookies);
  }
} catch {
  // Auth file may not exist
}
```

This was called before every `page.goto()`. It worked, but it was repetitive.

**The fix**: extract auth into a utility, then override the `page` fixture so it loads once per test:

```typescript
// src/utils/github-auth.ts
export async function ensureAuthCookies(context: BrowserContext): Promise<void> {
  try {
    const raw = fs.readFileSync('auth/github.json', 'utf-8');
    const { cookies } = JSON.parse(raw);
    if (cookies?.length) {
      await context.addCookies(cookies);
    }
  } catch {
    // Auth file may not exist on first run
  }
}

// src/fixtures/github-project.fixture.ts
export const test = base.extend<ProjectFixtures>({
  page: async ({ page }, use) => {
    await ensureAuthCookies(page.context());
    await use(page);
  },
  // ... other fixtures
});
```

Now every test using `github-project.fixture.ts` gets authenticated automatically — no imports, no duplicate code, no manual cookie injection.

---

## Bugs caught during implementation

### 1. `fullyParallel: true` breaks playwright-bdd

Six tests consistently failed with `bddTestData not found`. The root cause: `fullyParallel: true` in the Playwright config causes `test.use()` calls at module level to collide across workers. Setting `fullyParallel: false` fixed all six.

### 2. `networkidle` never resolves on GitHub

We tried adding `{ waitUntil: 'networkidle' }` to `page.goto()` to avoid stale status badges. Every navigation timed out after 60 seconds. GitHub maintains long-lived WebSocket connections and background polling that prevent `networkidle` from ever firing.

**Fix**: use `page.reload()` instead of `waitUntil: 'networkidle'` for cases where cached data might be stale.

### 3. GraphQL eventual consistency

The board workflow test (BRD-02) moved an item backwards and confirmed the move via `toPass`, but a subsequent API read returned the old status. GitHub's GraphQL layer exhibits eventual consistency — a mutation returns success before all read replicas reflect the change.

**Fix**: increased the `toPass` timeout from 5s to 15s, added a 1-second propagation buffer after confirmation, and swapped the backward move to use columns that don't have auto-workflow constraints (Backlog ↔ In Progress instead of Done → In Progress).

### 4. Label verification matched timeline history

The naive `page.getByRole('link', { name: /bug/ })` matched both the sidebar label AND the activity timeline entry where the label was added. Removing a label didn't make it disappear — it was still in the history.

**Fix**: scope the locator to the sidebar metadata section:

```typescript
const sidebar = page.getByRole('heading', { name: 'Metadata' }).locator('..');
await expect(sidebar.getByRole('link', { name: new RegExp(label) })).toBeVisible();
```

---

## Key takeaways

| Lesson                                    | Why it matters                                                                                                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Discover locators in a live browser**   | You can't write tests for a UI you haven't seen. playwright-cli lets you walk through the flow interactively before writing a single line of code.                               |
| **Role-based locators survive deploys**   | `button "Edit Labels"` will outlive any CSS refactor GitHub ships.                                                                                                               |
| **Dialog patterns are reusable**          | The label picker, the board filter, the assignee selector — all GitHub dialogs follow the same `option` + `Save`/`Escape` pattern. The discovery process for one applies to all. |
| **Dry up auth loading before it spreads** | Two duplications became three would become five. Extracting to the fixture level early prevented a refactoring headache later.                                                   |
| **Test the test framework itself**        | `fullyParallel`, `networkidle`, and event labeling bugs were framework-level issues caught because we ran the full suite, not just the new tests.                                |

---

The finished labels test suite adds 4 scenarios (14 total), covers both UI and API operations, and took exactly one session from `playwright-cli open` to all-green. The locators discovered here will be reused for assignees, milestones, and custom fields — all of which use the same sidebar "Edit" button and dialog pattern.

_Next up: Assignees & Milestones — building on the same sidebar interaction patterns._
