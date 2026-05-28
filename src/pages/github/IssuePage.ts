import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for GitHub Issue Details Page.
 */
export class IssuePage {
  readonly heading: (title: string) => Locator;
  readonly issueNumber: (num: number) => Locator;
  readonly bodyViewer: Locator;
  readonly stateLabel: Locator;
  constructor(public readonly page: Page) {
    this.heading = (title: string) => page.getByRole('heading', { name: title, level: 1 });
    this.issueNumber = (num: number) => page.getByText(`#${num}`).first();
    this.bodyViewer = page.getByTestId('issue-body-viewer');
    this.stateLabel = page.getByTestId('issue-metadata-fixed').getByTestId('header-state');
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

  async expectCommentVisible(body: string): Promise<void> {
    await expect(this.page.getByText(body)).toBeVisible();
  }

  async expectCommentNotVisible(body: string): Promise<void> {
    await expect(this.page.getByText(body)).not.toBeVisible();
  }
}
