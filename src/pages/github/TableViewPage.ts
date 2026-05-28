import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for GitHub Project Table View.
 */
export class TableViewPage {
  readonly viewButton: Locator;
  readonly tableButton: Locator;
  readonly grid: Locator;

  constructor(public readonly page: Page) {
    this.viewButton = page.getByRole('button', { name: 'View', exact: true });
    this.tableButton = page.getByRole('button', { name: 'Table' });
    this.grid = page.getByRole('grid');
  }

  async switchToTableLayout(): Promise<void> {
    await this.viewButton.click();
    await this.tableButton.click();
    await this.page.waitForURL(/layout=table/);
    await expect(this.grid).toBeVisible({ timeout: 15_000 });
    await this.page.keyboard.press('Escape');
    await expect(this.tableButton).not.toBeVisible();
  }

  getColumnHeader(name: string): Locator {
    return this.page.getByRole('columnheader', { name: new RegExp(`^${name}`) });
  }

  async expectColumnsVisible(columnNames: string[]): Promise<void> {
    for (const name of columnNames) {
      await expect(this.getColumnHeader(name)).toBeVisible();
    }
  }

  getRow(issueTitle: string): Locator {
    return this.page.getByRole('row').filter({ hasText: issueTitle });
  }

  async expectRowVisible(issueTitle: string): Promise<void> {
    await expect(this.getRow(issueTitle).first()).toBeVisible();
  }

  async expectRowNotVisible(issueTitle: string): Promise<void> {
    await expect(this.getRow(issueTitle).first()).not.toBeVisible();
  }

  async expectRowValue(issueTitle: string, value: string): Promise<void> {
    const row = this.getRow(issueTitle);
    await expect(row.getByText(value)).toBeVisible();
  }

  async sortColumnAscending(columnName: string): Promise<void> {
    const baseUrl = this.page.url().split('?')[0];
    await this.page.goto(
      `${baseUrl}?layout=table&sortedBy%5Bdirection%5D=asc&sortedBy%5BcolumnId%5D=${encodeURIComponent(columnName)}`,
    );
    await expect(this.grid).toBeVisible({ timeout: 15_000 });
  }

  async sortColumnDescending(columnName: string): Promise<void> {
    const baseUrl = this.page.url().split('?')[0];
    await this.page.goto(
      `${baseUrl}?layout=table&sortedBy%5Bdirection%5D=desc&sortedBy%5BcolumnId%5D=${encodeURIComponent(columnName)}`,
    );
    await expect(this.grid).toBeVisible({ timeout: 15_000 });
  }

  async getRowTitles(): Promise<string[]> {
    const titleLinks = this.page.getByRole('rowheader').getByRole('link');
    return titleLinks.allTextContents();
  }

  async expectRowBefore(firstTitle: string, secondTitle: string): Promise<void> {
    const titles = await this.getRowTitles();
    const firstIdx = titles.findIndex((t) => t.includes(firstTitle));
    const secondIdx = titles.findIndex((t) => t.includes(secondTitle));
    expect(firstIdx).not.toBe(-1);
    expect(secondIdx).not.toBe(-1);
    expect(firstIdx).toBeLessThan(secondIdx);
  }
}
