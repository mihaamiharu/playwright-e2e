import { Page, Locator, expect } from '@playwright/test';
import { waitForGitHubNavigation } from '../../utils/testing/wait-helpers';
import { ProjectSearchBar } from './filters/ProjectSearchBar';
import { env } from '../../config/env.config';

/**
 * Page Object Model for GitHub Project Table View.
 */
export class TableViewPage {
  readonly viewPath: string;
  readonly viewButton: Locator;
  readonly tableButton: Locator;
  readonly grid: Locator;

  constructor(
    public readonly page: Page,
    viewNumber: number = 1,
  ) {
    this.viewPath = `/users/${env.github.testRepoOwner}/projects/${env.github.sandboxProjectNumber}/views/${viewNumber}`;
    this.viewButton = page.getByRole('button', { name: /View$/ });
    this.tableButton = page.getByRole('menuitem', { name: 'Table' });
    this.grid = page.getByRole('grid');
  }

  async navigate(filterQuery?: string): Promise<void> {
    await this.page.goto(this.viewPath, { waitUntil: 'domcontentloaded' });
    await waitForGitHubNavigation(this.page);

    if (filterQuery) {
      const searchBar = new ProjectSearchBar(this.page);
      await searchBar.filterInput.fill(filterQuery);
      await this.page.keyboard.press('Enter');
      await this.page.waitForTimeout(500);
    }
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
    try {
      await this.grid.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await this.page.waitForTimeout(300);
      await expect(this.getRow(issueTitle).first()).toBeVisible();
      return;
    } catch {
      // row may not have propagated from GraphQL yet — reload and retry
    }

    await expect(async () => {
      await this.page.reload();
      await expect(this.grid).toBeVisible();
      await this.grid.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await this.page.waitForTimeout(400);
      await expect(this.getRow(issueTitle).first()).toBeVisible();
    }).toPass({ timeout: 15_000 });
  }

  async expectRowNotVisible(issueTitle: string): Promise<void> {
    await expect(async () => {
      await expect(this.getRow(issueTitle).first()).not.toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 10_000 });
  }

  async expectRowValue(issueTitle: string, value: string): Promise<void> {
    await expect(async () => {
      await this.page.reload();
      await expect(this.grid).toBeVisible();

      // Check if the value is visible in the row cell (column is visible)
      const row = this.getRow(issueTitle);
      const rowHasValue = await row
        .getByText(value)
        .isVisible()
        .catch(() => false);

      // Fallback: check if the value is in a group header row (column is grouped but not shown)
      const groupHasValue = await this.page
        .getByRole('row')
        .filter({ hasText: value })
        .isVisible()
        .catch(() => false);

      expect(rowHasValue || groupHasValue).toBe(true);
    }).toPass({ timeout: 15_000 });
  }

  async sortColumnAscending(columnName: string): Promise<void> {
    const baseUrl = this.page.url().split('?')[0];
    await this.page.goto(
      `${baseUrl}?layout=table&sortedBy%5Bdirection%5D=asc&sortedBy%5BcolumnId%5D=${encodeURIComponent(columnName)}`,
    );
    await expect(this.grid).toBeVisible();
  }

  async sortColumnDescending(columnName: string): Promise<void> {
    const baseUrl = this.page.url().split('?')[0];
    await this.page.goto(
      `${baseUrl}?layout=table&sortedBy%5Bdirection%5D=desc&sortedBy%5BcolumnId%5D=${encodeURIComponent(columnName)}`,
    );
    await expect(this.grid).toBeVisible();
  }

  async getRowTitles(): Promise<string[]> {
    await this.grid.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await this.page.waitForTimeout(300);
    const titleLinks = this.page.getByRole('rowheader').getByRole('link');
    return titleLinks.allTextContents();
  }

  async expectRowBefore(firstTitle: string, secondTitle: string): Promise<void> {
    await expect(async () => {
      const titles = await this.getRowTitles();
      const firstIdx = titles.findIndex((t) => t.includes(firstTitle));
      const secondIdx = titles.findIndex((t) => t.includes(secondTitle));
      expect(firstIdx).not.toBe(-1);
      expect(secondIdx).not.toBe(-1);
      expect(firstIdx).toBeLessThan(secondIdx);
    }).toPass({ timeout: 15_000 });
  }
}
