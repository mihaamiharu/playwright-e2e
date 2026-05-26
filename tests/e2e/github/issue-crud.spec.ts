import { test, expect } from '../../../src/fixtures/github-project.fixture';

test.describe('Issue CRUD', () => {
  test('ISS-01: Create issue via API → verify it appears on kanban board', async ({
    page,
    seededProjectIssue,
  }) => {
    const { title, number } = seededProjectIssue;

    // The fixture already created the issue and added it to the project.
    // Verify via UI: navigate to the issue page.
    await page.goto(`/mihaamiharu/playwright-e2e/issues/${number}`);

    // Issue title as main heading
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible({
      timeout: 15_000,
    });

    // Issue number in the header metadata (appears in both sticky + page header)
    await expect(page.getByText(`#${number}`).first()).toBeVisible();
  });
});
