import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Assignee sidebar panel on the GitHub Issue detail page.
 */
export class AssigneePanel {
  readonly assigneeSection: Locator;

  constructor(public readonly page: Page) {
    this.assigneeSection = page.getByTestId('sidebar-assignees-section');
  }

  async expectAssignee(username: string): Promise<void> {
    await expect(this.assigneeSection.getByRole('link', { name: username })).toBeVisible();
  }

  async expectNoAssignee(username: string): Promise<void> {
    await expect(this.assigneeSection.getByRole('link', { name: username })).not.toBeVisible();
    await expect(this.assigneeSection.getByText('No one')).toBeVisible();
  }
}
