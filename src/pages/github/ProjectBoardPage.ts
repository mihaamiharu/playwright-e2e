import { Page, Locator, expect } from '@playwright/test';
import { waitForGitHubNavigation } from '../../utils/testing/wait-helpers';
import { ProjectSearchBar } from './filters/ProjectSearchBar';

/**
 * Page Object Model for GitHub Project Kanban Board.
 */
export class ProjectBoardPage {
  readonly viewPath: string;

  constructor(
    public readonly page: Page,
    repoOwner: string,
    projectNumber: string,
    viewNumber: number = 1,
  ) {
    this.viewPath = `/users/${repoOwner}/projects/${projectNumber}/views/${viewNumber}`;
  }

  /**
   * If the view is in table layout, switch it to board/kanban layout.
   * Handles GitHub's view layout persistence — view defaults can change
   * or previous tests may have left the layout in table mode.
   */
  private async ensureBoardLayout(): Promise<void> {
    const isBoard = await this.page
      .locator('[data-board-column]')
      .first()
      .isVisible({ timeout: 1_000 })
      .catch(() => false);
    if (isBoard) return;

    // Click View → Board buttons (more reliable than URL parameter)
    await this.page.getByRole('button', { name: /View$/ }).click();
    await this.page.getByRole('button', { name: /Board/ }).click();
    await this.page.waitForURL(/layout=board/);
    await expect(this.page.locator('[data-board-column]').first()).toBeVisible({ timeout: 20_000 });
  }

  async navigate(filterQuery?: string): Promise<void> {
    await this.page.goto(this.viewPath, { waitUntil: 'domcontentloaded' });
    await waitForGitHubNavigation(this.page);
    await this.ensureBoardLayout();

    if (filterQuery) {
      const searchBar = new ProjectSearchBar(this.page);
      await searchBar.filterInput.fill(filterQuery);
      await this.page.keyboard.press('Enter');
      // Wait for the board to finish refreshing after search
      await this.page.waitForTimeout(500);
    }
  }

  private regexEscape(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  getDraggableCard(title: string): Locator {
    return this.page
      .locator('[aria-roledescription="draggable"]')
      .filter({ hasText: new RegExp(this.regexEscape(title)) });
  }

  // data-board-column is a stable framework attribute, not a hashed CSS class.
  // Priority-grouped views may render hidden duplicates — .first() avoids
  // strict-mode violations when interacting with the column.
  getColumn(columnName: string): Locator {
    return this.page.locator(`[data-board-column="${columnName}"]`).first();
  }

  async dragCardToColumn(cardTitle: string, toColumn: string): Promise<void> {
    await this.page.reload();
    await waitForGitHubNavigation(this.page);
    await this.ensureBoardLayout();

    const targetHeading = this.page.getByRole('heading', { name: toColumn, level: 2 });
    await expect(targetHeading).toBeVisible({ timeout: 20_000 });
    await targetHeading.scrollIntoViewIfNeeded();

    const card = this.getDraggableCard(cardTitle);
    await expect(card).toBeVisible();

    const column = this.getColumn(toColumn);

    const sourceBox = await card.boundingBox();
    if (!sourceBox) throw new Error(`Could not determine source card position for "${cardTitle}"`);

    const targetBox = await column.boundingBox();
    if (!targetBox) throw new Error(`Could not determine target column position for "${toColumn}"`);

    await this.page.mouse.move(
      sourceBox.x + sourceBox.width / 2,
      sourceBox.y + sourceBox.height / 2,
    );
    await this.page.mouse.down();
    await this.page.mouse.move(
      targetBox.x + targetBox.width / 2,
      targetBox.y + targetBox.height / 2,
      {
        steps: 20,
      },
    );
    await this.page.mouse.up();
  }
}
