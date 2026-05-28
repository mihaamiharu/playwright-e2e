import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object Model for GitHub Project Filter / Search Bar.
 *
 * Renamed from ProjectFilterBar — "search" better reflects its primary
 * use case (type-to-filter) and avoids ambiguity with board column filters.
 */
export class ProjectSearchBar {
  readonly filterInput: Locator;
  readonly saveButton: Locator;

  constructor(public readonly page: Page) {
    this.filterInput = page.getByRole('combobox', { name: 'Filter' });
    this.saveButton = page.getByRole('button', { name: 'Save', exact: true });
  }

  async open(): Promise<void> {
    if (await this.filterInput.isVisible()) {
      await this.filterInput.click();
    } else {
      await this.page.getByRole('combobox').first().click();
    }
  }

  async selectType(typeName: string): Promise<void> {
    const option = this.page.getByRole('option', {
      name: new RegExp(`^${typeName}(, Filter)?`, 'i'),
    });
    await expect(option).toBeVisible();
    await option.click();
  }

  async selectOption(optionName: string, optionTypeName?: string): Promise<void> {
    const namePattern = optionTypeName ? `${optionName}, ${optionTypeName}` : optionName;
    const option = this.page.getByRole('option', { name: new RegExp(namePattern, 'i') });
    await expect(option).toBeVisible();
    await option.click();
  }

  async typeSearch(text: string): Promise<void> {
    await this.page.keyboard.type(text);
  }

  async save(): Promise<void> {
    await this.saveButton.click();
  }

  async close(hiddenOptionLocator: Locator): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(hiddenOptionLocator).not.toBeVisible();
  }
}
