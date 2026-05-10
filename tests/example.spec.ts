import { test, expect } from '@playwright/test';

test('playwright is configured correctly', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example Domain/);
});
