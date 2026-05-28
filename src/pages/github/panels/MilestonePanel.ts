import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Milestone sidebar panel on the GitHub Issue detail page.
 */
export class MilestonePanel {
  readonly milestonesSection: Locator;
  readonly milestoneContainer: Locator;

  constructor(public readonly page: Page) {
    this.milestonesSection = page.getByTestId('sidebar-milestones-section');
    this.milestoneContainer = this.milestonesSection.getByTestId('issue-milestone-container');
  }

  async expectMilestone(milestoneTitle: string): Promise<void> {
    await expect(this.milestoneContainer).toContainText(milestoneTitle);
  }
}
