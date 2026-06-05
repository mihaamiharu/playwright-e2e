import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Board View — card visibility assertions on the Kanban board.
 *
 * Extracted from the ProjectBoardPage POM. All card-level visibility
 * and content checks belong here; board structure and drag-and-drop
 * stay in ProjectBoardPage.
 */
export class BoardView {
  readonly firstHeading: Locator;

  constructor(public readonly page: Page) {
    this.firstHeading = page.getByRole('heading', { level: 2 }).first();
  }

  private locatorForCard(title: string) {
    return this.page.getByRole('button', {
      name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    });
  }

  async expectCardVisible(cardTitle: string): Promise<void> {
    await expect(this.locatorForCard(cardTitle).first()).toBeVisible({ timeout: 30_000 });
  }

  async expectCardNotVisible(cardTitle: string): Promise<void> {
    await expect(async () => {
      await expect(this.locatorForCard(cardTitle).first()).not.toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 10_000 });
  }
}
