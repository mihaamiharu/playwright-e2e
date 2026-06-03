import { Page, Locator, expect } from '@playwright/test';
import { waitForGitHubNavigation } from '../../utils/testing/wait-helpers';
import { ProjectSearchBar } from './filters/ProjectSearchBar';

/**
 * Page Object Model for GitHub Project Kanban Board.
 */
export class ProjectBoardPage {
  readonly viewPath: string;
  readonly firstHeading: Locator;

  constructor(
    public readonly page: Page,
    repoOwner: string,
    projectNumber: string,
  ) {
    this.viewPath = `/users/${repoOwner}/projects/${projectNumber}/views/1`;
    this.firstHeading = page.getByRole('heading', { level: 2 }).first();
  }

  async navigate(filterQuery?: string): Promise<void> {
    await this.page.goto(this.viewPath, { waitUntil: 'domcontentloaded' });
    await waitForGitHubNavigation(this.page);
    await expect(this.firstHeading).toBeVisible();

    if (filterQuery) {
      const searchBar = new ProjectSearchBar(this.page);
      await searchBar.filterInput.fill(filterQuery);
      await this.page.keyboard.press('Enter');
      // Wait for the board to finish refreshing after search
      await this.page.waitForTimeout(500);
    }
  }

  getDraggableCard(title: string): Locator {
    return this.page
      .locator('[aria-roledescription="draggable"]')
      .filter({ hasText: new RegExp(title) });
  }

  // data-board-column is a stable framework attribute, not a hashed CSS class.
  getColumn(columnName: string): Locator {
    return this.page.locator(`[data-board-column="${columnName}"]`);
  }

  async dragCardToColumn(cardTitle: string, toColumn: string): Promise<void> {
    await this.page.reload();
    await waitForGitHubNavigation(this.page);
    await expect(this.firstHeading).toBeVisible();

    const targetHeading = this.page.getByRole('heading', { name: toColumn, level: 2 });
    await expect(targetHeading).toBeVisible();
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
