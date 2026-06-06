import { chromium } from '@playwright/test';

async function deleteViewByNumber(page: any, viewNumber: number): Promise<boolean> {
  try {
    await page.goto(`https://github.com/users/mihaamiharu/projects/8/views/${viewNumber}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(1500);

    // Click "View options" — use evaluate to bypass tooltip overlays
    const viewOptionsBtn = page.getByRole('button', { name: /View options/ });
    await viewOptionsBtn.waitFor({ state: 'attached', timeout: 10000 });
    await viewOptionsBtn.evaluate((el: HTMLElement) => el.click());

    // Click "Delete view" menuitem
    const deleteItem = page.getByRole('menuitem', { name: 'Delete view' });
    await deleteItem.waitFor({ state: 'visible', timeout: 5000 });
    await deleteItem.click();

    // Confirm in alertdialog
    const dialog = page.getByRole('alertdialog', { name: 'Delete view?' });
    const confirmBtn = dialog.getByRole('button', { name: 'Delete' });
    await confirmBtn.waitFor({ state: 'visible', timeout: 5000 });
    await confirmBtn.click();

    // Wait for deletion to complete (GitHub redirects away)
    await page
      .waitForURL((url) => !url.pathname.includes(`/views/${viewNumber}`), {
        timeout: 10000,
      })
      .catch(() => {});
    await page.waitForTimeout(500);
    return true;
  } catch (e) {
    console.log(`  View ${viewNumber} FAILED: ${(e as Error).message.slice(0, 80)}`);
    return false;
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: 'auth/github.json' });
  const page = await context.newPage();

  // Login check — navigate to project first
  await page.goto('https://github.com/users/mihaamiharu/projects/8/views/1', {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });
  await page.waitForTimeout(2000);
  console.log('Logged in, starting view deletion...');

  // Delete views descending (after deletion, URL redirects away)
  let deleted = 0;
  let failed = 0;
  for (let v = 129; v >= 87; v--) {
    process.stdout.write(`Deleting view ${v}... `);
    if (await deleteViewByNumber(page, v)) {
      console.log('OK');
      deleted++;
    } else {
      failed++;
    }
  }

  console.log(`\nDone. Deleted: ${deleted}, Failed: ${failed}`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
