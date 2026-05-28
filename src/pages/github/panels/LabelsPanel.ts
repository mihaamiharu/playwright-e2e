import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Labels sidebar panel on the GitHub Issue detail page.
 *
 * Extracted from the monolithic IssuePage POM as a focused component.
 * Handles label add/remove via the Edit Labels dialog and visibility checks.
 */
export class LabelsPanel {
  readonly editLabelsButton: Locator;
  readonly applyLabelsDialog: Locator;
  readonly sidebarMetadata: Locator;

  constructor(public readonly page: Page) {
    this.editLabelsButton = page.getByRole('button', { name: 'Edit Labels' });
    this.applyLabelsDialog = page.getByRole('dialog', { name: 'Apply labels to this issue' });
    this.sidebarMetadata = page.getByRole('heading', { name: 'Metadata' }).locator('..');
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
}
