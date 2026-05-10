import { Page, Locator, expect } from '@playwright/test';

/**
 * GitHub Login page — resilient to DOM changes via role-based locators.
 *
 * GitHub uses hashed CSS class names that change on every deploy.
 * This page object uses ONLY role, label, placeholder, and text locators.
 */
export class LoginPage {
  readonly url = 'https://github.com/login';

  // ── Locators ──────────────────────────────────────────

  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly errorMessage: Locator;

  constructor(public readonly page: Page) {
    this.usernameInput = page.getByLabel('Username or email address');
    this.passwordInput = page.getByLabel('Password');
    this.signInButton = page.getByRole('button', { name: 'Sign in' });
    this.errorMessage = page.getByRole('alert');
  }

  // ── Actions ───────────────────────────────────────────

  async navigate(): Promise<void> {
    await this.page.goto(this.url, { waitUntil: 'domcontentloaded' });
    await expect(this.usernameInput).toBeVisible({ timeout: 10_000 });
  }

  async login(username: string, password: string): Promise<void> {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
  }

  async submit(): Promise<void> {
    await this.signInButton.click();
  }

  /** Full login flow — fill + submit. */
  async loginAndSubmit(username: string, password: string): Promise<void> {
    await this.login(username, password);
    await this.submit();
  }

  // ── Assertions ────────────────────────────────────────

  async expectValidationError(message: string): Promise<void> {
    await expect(this.errorMessage).toContainText(message, { timeout: 10_000 });
  }
}
