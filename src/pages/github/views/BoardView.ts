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
    // Fast path — card may already be rendered after navigation
    const card = this.page.getByRole('button', { name: new RegExp(title) });
    try {
      await expect(card.first()).toBeVisible({ timeout: 3_000 });
      return;
    } catch {
      // card may not have propagated from GraphQL yet — wait and retry
    }

    // Slow path — wait for GraphQL data to load.  Each retry waits up to 5s
    // for the element.  Avoids page.reload which resets the render cycle and
    // re-enters the same race condition.
    await expect(async () => {
      const retried = this.page.getByRole('button', { name: new RegExp(title) });
      await expect(retried.first()).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 15_000 });
  }

  async expectCardNotVisible(title: string): Promise<void> {
    await expect(async () => {
      const card = this.page.getByRole('button', { name: new RegExp(title) });
      await expect(card.first()).not.toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 10_000 });
  }
}
