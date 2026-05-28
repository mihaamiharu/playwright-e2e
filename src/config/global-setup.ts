import { chromium, type FullConfig } from '@playwright/test';
import dotenv from 'dotenv';
import * as fs from 'fs';
import { fetchVerificationCode } from './setup/imap-poller';
import { ensureSandboxFields } from './setup/sandbox-bootstrap';

dotenv.config();

const AUTH_FILE = 'auth/github.json';

async function globalSetup(_config: FullConfig) {
  if (fs.existsSync(AUTH_FILE)) {
    console.log('✅ Auth state found — skipping login');
    return;
  }

  const username = process.env.GH_USERNAME;
  const password = process.env.GH_PASSWORD;

  if (!username || !password) {
    console.warn('⚠️  GH_USERNAME or GH_PASSWORD not set — skipping auth setup');
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('https://github.com/login', { waitUntil: 'networkidle' });
    await page.getByLabel('Username or email address').fill(username);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await page.waitForURL(
      (url) => {
        const path = url.pathname;
        return (
          !path.startsWith('/login') &&
          (!path.startsWith('/session') || path.includes('/verified-device'))
        );
      },
      { timeout: 15_000 },
    );
    let currentUrl = page.url();
    console.log(`📍 Post-login URL: ${currentUrl}`);

    await page.screenshot({ path: 'reports/artifacts/debug-post-submit.png' });

    if (currentUrl.includes('/sessions/verified-device')) {
      console.log('📱 Device verification required');
      let verified = false;

      for (let vAttempt = 1; vAttempt <= 3; vAttempt++) {
        console.log(`  📱 Verification attempt ${vAttempt}/3...`);

        const code = await fetchVerificationCode();

        await page.getByLabel('Device Verification Code').clear();
        await page.getByLabel('Device Verification Code').fill(code);
        await page.screenshot({
          path: `reports/artifacts/verify-code-filled-${vAttempt}.png`,
        });

        try {
          await page.getByRole('button', { name: 'Verify' }).click({
            noWaitAfter: true,
            timeout: 5000,
          });
        } catch {
          console.log('  ℹ️  Verify button gone — page may have auto-submitted');
        }

        try {
          await page.waitForURL('https://github.com/', { timeout: 10_000 });
          verified = true;
          console.log('✅ Device verification passed');
          break;
        } catch {
          await page.screenshot({
            path: `reports/artifacts/verify-failed-${vAttempt}.png`,
          });
          console.warn(`  ⚠️  Verification attempt ${vAttempt}/3 failed — still on: ${page.url()}`);

          if (vAttempt < 3) {
            console.log('  ⏳ Waiting 5s for a fresh verification email before retry...');
            await page.waitForTimeout(5000);
          }
        }
      }

      if (!verified) {
        console.warn('⚠️  Device verification exhausted. Skipping browser auth.');
        return;
      }
    }

    currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      console.log('🔐 CAPTCHA or challenge detected — attempting AI-assisted solve...');

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn(
          '⚠️  GEMINI_API_KEY not set — CAPTCHA cannot be solved. Skipping browser auth.',
        );
        return;
      }

      const { solveCaptcha } = await import('../utils/ai/captcha-solver');
      const solved = await solveCaptcha(page, apiKey);

      if (!solved) {
        console.warn('⚠️  CAPTCHA solver exhausted. Browser auth unavailable.');
        console.warn('    Tests will proceed without browser cookies (API tests may still pass).');
        return;
      }
    }

    const finalUrl = page.url();
    await page.screenshot({ path: 'reports/artifacts/debug-final.png' });

    if (!finalUrl.startsWith('https://github.com/') || finalUrl.includes('/login')) {
      await page.screenshot({ path: 'reports/artifacts/login-failed.png' });
      console.warn(
        '⚠️  Login blocked — unexpected page state. Tests will proceed without browser auth.',
      );
      console.warn(`    Final URL: ${finalUrl}`);
      return;
    }

    await page.context().storageState({ path: AUTH_FILE });
    console.log(`✅ GitHub auth saved to ${AUTH_FILE}`);

    await ensureSandboxFields();
  } finally {
    await browser.close();
  }
}

export default globalSetup;
