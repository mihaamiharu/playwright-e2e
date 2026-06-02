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

  async expectCardVisible(title: string): Promise<void> {
    const card = this.page.getByRole('button', { name: new RegExp(title) });

    try {
      await this.page.keyboard.press('End');
      await this.page.waitForTimeout(200);
      await expect(card.first()).toBeVisible();
      return;
    } catch {
      // card may not have propagated from GraphQL yet — reload and retry
    }

    await expect(async () => {
      await this.page.reload();
      await expect(this.firstHeading).toBeVisible();
      await this.page.keyboard.press('End');
      await this.page.waitForTimeout(200);
      const refreshedCard = this.page.getByRole('button', { name: new RegExp(title) });
      await expect(refreshedCard.first()).toBeVisible();
    }).toPass({ timeout: 15_000 });
  }

  async expectCardNotVisible(title: string): Promise<void> {
    await expect(async () => {
      const card = this.page.getByRole('button', { name: new RegExp(title) });
      await expect(card.first()).not.toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 10_000 });
  }
}
