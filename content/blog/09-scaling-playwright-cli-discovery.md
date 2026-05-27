# From Single Click to Full Workflow: Scaling playwright-cli to Multi-Step UI Flows

> **Part 9 of the Playwright E2E series.**
> [Part 1](/blog/01-why-real-websites.md) — Why real websites beat demo apps
> [Part 2](/architecture-tour) — Architecture of a production-grade E2E suite
> [Part 3](/fixtures-over-basetest) — Why fixtures over BaseTest
> [Part 4](/blog/04-authentication-without-2fa.md) — Authentication without the 2FA nightmare
> [Part 5](/blog/05-building-label-tests-with-ui-discovery.md) — Building E2E label tests with UI discovery
> [Part 6](/blog/06-assignees-milestones.md) — Assignees & Milestones: The Sidebar Pattern Pays Off
> [Part 7](/blog/07-real-world-e2e-gotchas.md) — 4 real-world E2E gotchas from GitHub Projects
> [Part 8](/blog/08-graphql-schema-archaeology.md) — GraphQL Schema Archaeology: Finding the Right Mutation

---

## The premise: one feature, five UI steps, zero known locators

Phase 5's Saved Views scenarios presented a new kind of challenge. Unlike labels (Part 5 — one dialog, one action) or assignees (Part 6 — same dialog pattern, different field), saved views required a multi-step sequential flow where the state of the page changes at every step:

| Step | Action                            | Page State After                                                              |
| ---- | --------------------------------- | ----------------------------------------------------------------------------- |
| 1    | Navigate to kanban view           | Board with columns, view tabs, toolbar                                        |
| 2    | Create a new board view           | New tab "View N" appears in the tablist, URL changes to `/views/N`            |
| 3    | Apply a filter (Status = Backlog) | Filter chips appear in the toolbar, URL gains `?filterQuery=status%3ABacklog` |
| 4    | Rename the view                   | Tab name changes, "View options for View N" → "View options for {name}"       |
| 5    | Reload and verify persistence     | Same URL, same tab name, filter and sort preserved                            |

Part 5 taught us: open the browser with playwright-cli, interact with the page, snapshot the ARIA tree, and document the locators. That works for a single dialog. For a five-step flow, we needed a **discovery session** — a methodical walk-through where each interaction reveals the next set of locators and every state transition is captured.

---

## Step 1: Navigate and orient

```bash
playwright-cli open --browser=chrome
playwright-cli state-load auth/github.json
playwright-cli goto https://github.com
playwright-cli goto https://github.com/users/mihaamiharu/projects/8/views/1
playwright-cli snapshot
```

The initial snapshot revealed the full board structure. The key elements for our flow:

```yaml
navigation "Select view":
  tablist:
    tab "Backlog" [selected]
    tab "Priority board"
    tab "Team items"
    tab "Roadmap"
    tab "My items"
    tab "New view"           ← our starting point

region "View filters":
  combobox "Filter"          ← for applying filters

button "View options for Backlog" ← for rename/delete
```

Right away we learned something important: views aren't managed through a separate "Views" panel. They live as **tabs** in a `tablist`, and each tab has a `button` that opens its own options menu. The pattern for interacting with a view is: click its tab → interact with the board → click its options button to rename/delete.

---

## Step 2: The "New view" menu is not a page — it's a menu

```bash
playwright-cli click "getByRole('tab', { name: 'New view' })"
playwright-cli snapshot --depth=8
```

The tab click didn't create a new view. It opened a **menu**:

```yaml
menu "New view":
  group "Layout":
    menuitem "Table" [active]
    menuitem "Board"
    menuitem "Roadmap"
  menuitem "Duplicate view"
```

The "New view" button offers layout options. Selecting a layout creates the view:

```bash
playwright-cli click "getByRole('menuitem', { name: 'Board' })"
```

This navigated to `/views/6` — a new view was born. The tablist now showed:

```yaml
tab "Backlog"
tab "Priority board"
tab "Team items"
tab "Roadmap"
tab "My items"
tab "View 6" [selected]      ← new view, auto-named "View 6"
tab "New view"
button "View options for View 6"
```

**Lesson**: Clicking a tab doesn't always navigate. Sometimes it opens a menu. The locator path is: `getByRole('tab')` → `getByRole('menuitem')` → layout chosen → URL changes.

---

## Step 3: Apply a filter and capture state transitions

```bash
playwright-cli click "getByRole('combobox', { name: 'Filter' })"
playwright-cli snapshot --depth=10
```

The filter combobox revealed a list of filter category options. Part 7 (Gotcha 1) had already taught us about substring matching in filter option names, so we used the same pattern:

```bash
playwright-cli click "getByRole('option', { name: /Status/ })"
playwright-cli click "getByRole('option', { name: /Backlog/ })"
```

The URL changed immediately: `?filterQuery=status%3ABacklog`. Two state transitions occurred:

| Transition            | Before              | After                                     |
| --------------------- | ------------------- | ----------------------------------------- |
| Filter combobox value | Empty               | `status:Backlog`                          |
| URL query params      | `/views/6`          | `/views/6?filterQuery=status%3ABacklog`   |
| Toolbar buttons       | Just "Filter"       | Now includes "Discard" and "Save" buttons |
| Board content         | All columns visible | Only Backlog column with items            |

The "Save" and "Discard" buttons appear because changing the filter in a new view triggers an "Unsaved changes" state. Our step definition needed to either:

1. Click "Save" to persist the filter, or
2. Click "Discard" to revert

In practice, leaving the filter unsaved still preserves it in the URL — GitHub auto-saves view modifications during the session. The "Save" button is only required if you want to persist changes _to the view definition_ so they survive after you switch tabs. Since reloading stays on the same view, the auto-saved filter was sufficient.

But for safety, and to match the actual flow, our step clicks Save after applying:

```typescript
await page.getByRole('option', { name: /Status, Filter/ }).click();
await page.getByRole('option', { name: new RegExp(`${value}, Status`) }).click();
```

---

## Step 4: Rename the view through its dialog

```bash
playwright-cli click "getByRole('button', { name: /View options for/ })"
playwright-cli snapshot --depth=8
```

The options menu opened:

```yaml
menu "View options for View 6": menuitem "Rename view"
  menuitem "Move view"
  menuitem "Save changes to new view"
  menuitem "Delete view"
  menuitem "Generate chart"
  menuitem "Export view data"
```

Selecting "Rename view" opened a modal dialog:

```bash
playwright-cli click "getByRole('menuitem', { name: 'Rename view' })"
playwright-cli snapshot --depth=10
```

```yaml
dialog "Rename view":
  heading "Rename view" [level=1]
  button "Close"
  textbox "View name" [active]: "View 6"
  button "Cancel"
  button "Save"
```

The rename flow is a standard dialog pattern: `dialog "Rename view"` → `textbox "View name"` → fill new name → `button "Save"`. But scoping matters. There can be multiple "Save" buttons on the page (the filter bar also has one). Without dialog scoping, you hit a strict-mode violation:

```typescript
// ❌ Fragile — multiple "Save" buttons on the page
await page.getByRole('button', { name: 'Save' }).click();

// ✅ Scoped to the rename dialog
await page
  .getByRole('dialog', { name: 'Rename view' })
  .getByRole('button', { name: 'Save' })
  .click();
```

After renaming, the title changed:

```
Title: "View 6 · kanban-board"  →  "E2E Test View · kanban-board"
Tab:    "View 6"                 →  "E2E Test View"
Button: "View options for View 6" → "View options for E2E Test View"
```

The complete rename step:

```typescript
When('I create a new board view named {string}', async ({ page }, baseName) => {
  // Step 2: create view
  await page.getByRole('tab', { name: 'New view' }).click();
  await page.getByRole('menuitem', { name: 'Board' }).click();
  await page.waitForURL(/\/views\/\d+/);

  // Step 4: rename
  await page.getByRole('button', { name: /View options for/ }).click();
  await page.getByRole('menuitem', { name: 'Rename view' }).click();

  const dialog = page.getByRole('dialog', { name: 'Rename view' });
  const textbox = dialog.getByRole('textbox', { name: 'View name' });
  await textbox.clear();
  await textbox.fill(baseName + ' ' + Date.now()); // uniqueness
  await dialog.getByRole('button', { name: 'Save' }).click();
});
```

---

## Step 5: Reload and verify persistence

```bash
playwright-cli reload
playwright-cli snapshot --depth=6
```

After reloading, we verified three things:

1. **URL**: Still `?filterQuery=status%3ABacklog` — the filter persisted
2. **Title**: `E2E Test View · kanban-board` — the name persisted
3. **Tab state**: `tab "E2E Test View" [selected]` — the active tab persisted

```typescript
Then(
  'the current view should show filter {string} with value {string}',
  async ({ page }, field, value) => {
    await expect(page).toHaveURL(new RegExp(`filterQuery=${field.toLowerCase()}%3A${value}`));
    await expect(page.getByRole('combobox', { name: 'Filter' })).toHaveValue(new RegExp(value));
  },
);
```

---

## The scoping lesson: overflow menus cause strict-mode violations

When we first wrote the tab verification step, we used a page-level locator:

```typescript
const tab = page.getByRole('tab', { name: viewName });
await expect(tab).toHaveAttribute('aria-selected', 'true');
```

This failed with:

```
Error: strict mode violation: getByRole('tab', { name: 'E2E Test View' })
resolved to 6 elements
```

Six tabs with the same name? The board only shows one tab per view. The issue: previous test runs had created views with the same name and GitHub's overflow mechanism — when there are too many tabs to display, the extras appear in a **hidden overflow menu** that also contains `role="tab"` elements. Even though these tabs are not visible on screen, they still match `getByRole('tab', { name: '...' })`.

The fix: scope to the visible `tablist`:

```typescript
// ✅ Only the visible tablist, not overflow menus
const tab = page.getByRole('tablist').getByRole('tab', { name: viewName });
await expect(tab).toHaveAttribute('aria-selected', 'true');
```

---

## The uniqueness lesson: timestamp-suffixed names prevent cross-run collisions

The original feature file used a static view name:

```gherkin
When I create a new board view named "E2E Test View"
```

Every test run created a view with the same name. By the 6th run, we had 6 tabs named "E2E Test View" in the overflow menu, causing the strict-mode violation above.

The fix: make the view name unique per test run:

```typescript
let currentViewName = '';

When('I create a new board view named {string}', async ({ page }, baseName) => {
  currentViewName = `${baseName} ${Date.now()}`;
  // ... create and rename with currentViewName ...
});
```

The feature file still uses a static string, but the step definition appends a timestamp. The Then step that verifies the tab reads from `currentViewName` rather than the Gherkin parameter:

```typescript
Then('the created view tab should be visible', async ({ page }) => {
  await expect(page).toHaveTitle(new RegExp(currentViewName));
  const tab = page.getByRole('tablist').getByRole('tab', { name: currentViewName });
  await expect(tab).toHaveAttribute('aria-selected', 'true');
});
```

This means VIEW-01's verification uses a dedicated step (`then the created view tab should be visible`) while VIEW-02's view-switching verification uses a parameterized step (`then the current view tab should be named {string}`). The separation prevents the timestamp-suffixed name from leaking into the parameter-based step.

---

## Switching between saved views

VIEW-02 required a simpler flow — just clicking existing tabs:

```bash
playwright-cli click "getByRole('tab', { name: 'Priority board' })"
# URL → /views/2, title → "Priority board · kanban-board"

playwright-cli click "getByRole('tab', { name: 'Backlog' })"
# URL → /views/1, title → "Backlog · kanban-board"
```

Tab switching changes the URL path (`/views/N`) and the page title. The step definition:

```typescript
When('I switch to the {string} view', async ({ page }, viewName) => {
  await page.getByRole('tab', { name: viewName }).click();
  await page.waitForURL(/\/views\/\d+/);
});
```

The verification checks both the title and the tab's `aria-selected` attribute:

```typescript
Then('the current view tab should be named {string}', async ({ page }, viewName) => {
  await expect(page).toHaveTitle(new RegExp(viewName));
  const tab = page.getByRole('tablist').getByRole('tab', { name: viewName });
  await expect(tab).toHaveAttribute('aria-selected', 'true');
});
```

---

## The locator table

| UI Element           | Locator                                                         | Notes                             |
| -------------------- | --------------------------------------------------------------- | --------------------------------- |
| View tablist         | `getByRole('tablist')`                                          | Scopes to visible tabs only       |
| Specific view tab    | `getByRole('tab', { name: viewName })`                          | For switching                     |
| New view tab         | `getByRole('tab', { name: 'New view' })`                        | Opens a menu, not a page          |
| Board layout option  | `getByRole('menuitem', { name: 'Board' })`                      | Inside New view menu              |
| Table layout option  | `getByRole('menuitem', { name: 'Table' })`                      | Inside New view menu              |
| Open view options    | `getByRole('button', { name: /View options for/ })`             | Regex matches any view            |
| Rename view option   | `getByRole('menuitem', { name: 'Rename view' })`                | Inside options menu               |
| Rename dialog        | `getByRole('dialog', { name: 'Rename view' })`                  | For scoping Save button           |
| View name textbox    | `getByRole('textbox', { name: 'View name' })`                   | Inside rename dialog              |
| Filter combobox      | `getByRole('combobox', { name: 'Filter' })`                     | Part 7, Gotcha 1                  |
| Status filter option | `getByRole('option', { name: /Status, Filter/ })`               | Filters list                      |
| Filter value option  | `getByRole('option', { name: new RegExp(value + ', Status') })` | Status value                      |
| Selected tab check   | `toHaveAttribute('aria-selected', 'true')`                      | On the tab element                |
| Page title check     | `toHaveTitle(new RegExp(viewName))`                             | First verification of active view |
| Filter URL check     | `toHaveURL(new RegExp(\`filterQuery=\`))`                       | Verifies filter applied           |
| Delete view option   | `getByRole('menuitem', { name: 'Delete view' })`                | For cleanup                       |
| Delete confirmation  | `getByRole('alertdialog', { name: 'Delete view?' })`            | Click "Delete" button inside      |

---

## Key takeaways

| Lesson                                                              | Why it matters                                                                                                                                                                                                                     |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Multi-step flows need discovery sessions, not one-shot commands** | A single `snapshot` won't show you the rename dialog, the options menu, or the Unsaved changes state. Walk through the flow step by step, snapshotting after each action.                                                          |
| **Scope tab locators to `tablist`**                                 | Overflow menus duplicate tab elements. `getByRole('tablist').getByRole('tab', { name })` is the difference between passing and a 6-element strict-mode violation.                                                                  |
| **Dialog scope matters for button names**                           | There can be multiple "Save" buttons on the page at once (filter bar + rename dialog). Scope clicks to the dialog: `dialog.getByRole('button', { name: 'Save' })`.                                                                 |
| **Timestamp-suffix test data that persists across runs**            | Views survive the page session. If your test creates a view with a static name and doesn't delete it, you'll accumulate duplicates until your locators break. Append `${Date.now()}` to every name.                                |
| **Verify state transitions at every step**                          | After creating a view, check the URL changed. After applying a filter, check the URL gain parameters. After renaming, check the title changed. Each assertion is a breadcrumb that makes debugging easier when a later step fails. |
| **Playwright-cli is a research tool, not just a debugger**          | The 15-minute discovery session for saved views produced a complete locator table covering all five steps. We never had to open the test runner to find a locator.                                                                 |

---

The saved views tests shipped in under 30 minutes of discovery — and the discovery session itself produced the step definitions. By the time we closed the playwright-cli browser, we had every locator, every state transition, and both verification strategies documented. The feature file and step file were a transcription exercise, not a debugging exercise.

Phase 5 delivered 13 scenarios across 7 new domains, completing the entire 37-scenario test plan. The final tally: 11 feature files, 11 step files, 5 new GraphQL operations, and 2 playwright-cli discovery sessions that turned multi-step UI flows from "unknown territory" into "solved problems."
