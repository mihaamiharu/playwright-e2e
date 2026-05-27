import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for GitHub Issue Details Page.
 */
export class IssuePage {
  readonly heading: (title: string) => Locator;
  readonly issueNumber: (num: number) => Locator;
  readonly bodyViewer: Locator;
  readonly stateLabel: Locator;
  readonly editLabelsButton: Locator;
  readonly applyLabelsDialog: Locator;
  readonly sidebarMetadata: Locator;
  readonly assigneeSection: Locator;
  readonly milestonesSection: Locator;
  readonly milestoneContainer: Locator;

  constructor(public readonly page: Page) {
    this.heading = (title: string) => page.getByRole('heading', { name: title, level: 1 });
    this.issueNumber = (num: number) => page.getByText(`#${num}`).first();
    this.bodyViewer = page.getByTestId('issue-body-viewer');
    this.stateLabel = page.getByTestId('issue-metadata-fixed').getByTestId('header-state');
    this.editLabelsButton = page.getByRole('button', { name: 'Edit Labels' });
    this.applyLabelsDialog = page.getByRole('dialog', { name: 'Apply labels to this issue' });
    this.sidebarMetadata = page.getByRole('heading', { name: 'Metadata' }).locator('..');
    this.assigneeSection = page.getByTestId('sidebar-assignees-section');
    this.milestonesSection = page.getByTestId('sidebar-milestones-section');
    this.milestoneContainer = this.milestonesSection.getByTestId('issue-milestone-container');
  }

  async navigateTo(repo: string, issueNumber: number): Promise<void> {
    await this.page.goto(`/${repo}/issues/${issueNumber}`);
  }

  async expectHeading(title: string): Promise<void> {
    await expect(this.heading(title)).toBeVisible();
  }

  async expectIssueNumber(num: number): Promise<void> {
    await expect(this.issueNumber(num)).toBeVisible();
  }

  async expectBodyText(text: string): Promise<void> {
    await expect(this.bodyViewer).toBeVisible();
    await expect(this.bodyViewer).toContainText(text);
  }

  async expectState(expectedStatus: string): Promise<void> {
    await expect(this.stateLabel).toBeVisible();
    await expect(this.stateLabel).toHaveText(expectedStatus);
  }

  async addLabel(label: string): Promise<void> {
    await this.editLabelsButton.click();
    await expect(this.applyLabelsDialog).toBeVisible();
    await this.applyLabelsDialog.getByRole('option', { name: label }).click();
    await this.page.keyboard.press('Escape');
    await expect(this.applyLabelsDialog).not.toBeVisible();
  }

  async removeLabel(label: string): Promise<void> {
    await this.addLabel(label);
  }

  async expectLabelVisible(label: string): Promise<void> {
    await expect(this.sidebarMetadata.getByRole('link', { name: new RegExp(label) })).toBeVisible();
  }

  async expectLabelNotVisible(label: string): Promise<void> {
    await expect(
      this.sidebarMetadata.getByRole('link', { name: new RegExp(label) }),
    ).not.toBeVisible();
  }

  async expectAssignee(username: string): Promise<void> {
    await expect(this.assigneeSection.getByRole('link', { name: username })).toBeVisible();
  }

  async expectNoAssignee(username: string): Promise<void> {
    await expect(this.assigneeSection.getByRole('link', { name: username })).not.toBeVisible();
    await expect(this.assigneeSection.getByText('No one')).toBeVisible();
  }

  async expectMilestone(milestoneTitle: string): Promise<void> {
    await expect(this.milestoneContainer).toContainText(milestoneTitle);
  }

  async expectCommentVisible(body: string): Promise<void> {
    await expect(this.page.getByText(body)).toBeVisible();
  }

  async expectCommentNotVisible(body: string): Promise<void> {
    await expect(this.page.getByText(body)).not.toBeVisible();
  }
}
