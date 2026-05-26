import { chromium, type FullConfig } from '@playwright/test';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const AUTH_FILE = 'auth/github.json';

/**
 * Fetch the latest GitHub device verification code from Gmail via IMAP (himalaya).
 * Polls up to ~45s, waiting for the email to arrive.
 */
function fetchVerificationCode(): string {
  const maxAttempts = 9;
  const delayMs = 5000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Get ID of the most recent GitHub verification email
    const listOutput = execSync(
      "export PATH=\"$HOME/.local/bin:$PATH\" && himalaya envelope list --page 1 --page-size 10 2>/dev/null",
      { encoding: 'utf-8', timeout: 15_000 },
    );

    // Find the latest GitHub verification email ID
    const lines = listOutput.split('\n');
    let emailId: string | null = null;
    for (const line of lines) {
      const match = line.match(/^\|\s*(\d+)\s*\|.*\[GitHub\] Please verify your device/);
      if (match) {
        emailId = match[1];
        break;
      }
    }

    if (!emailId) {
      if (attempt < maxAttempts) {
        console.log(`⏳ Verification email not found yet (attempt ${attempt}/${maxAttempts}) — waiting ${delayMs / 1000}s...`);
        execSync(`sleep ${delayMs / 1000}`);
        continue;
      }
      throw new Error('GitHub verification email never arrived — checked 9 times over ~45s');
    }

    // Read the email body
    const emailBody = execSync(
      `export PATH="$HOME/.local/bin:$PATH" && himalaya message read ${emailId} 2>/dev/null`,
      { encoding: 'utf-8', timeout: 15_000 },
    );

    // Extract 6-digit verification code
    const codeMatch = emailBody.match(/Verification code:\s*(\d{6})/);
    if (!codeMatch) {
      throw new Error(`Could not find verification code in email #${emailId}`);
    }

    console.log(`✅ Found verification email (ID: ${emailId}) — code: ${codeMatch[1]}`);
    return codeMatch[1];
  }

  throw new Error('Failed to fetch verification code');
}

async function globalSetup(config: FullConfig) {
  // Skip login if storage state already exists
  if (fs.existsSync(AUTH_FILE)) {
    console.log('✅ Auth state found — skipping login');
    return;
  }

  const username = process.env.GITHUB_USERNAME;
  const password = process.env.GITHUB_PASSWORD;

  if (!username || !password) {
    console.warn('⚠️  GITHUB_USERNAME or GITHUB_PASSWORD not set — skipping auth setup');
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to GitHub login
    await page.goto('https://github.com/login', { waitUntil: 'networkidle' });

    // Fill credentials
    await page.getByLabel('Username or email address').fill(username);
    await page.getByLabel('Password').fill(password);

    // Use exact:true to avoid matching the passkey button
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    // Wait to see where we land
    await page.waitForTimeout(3000);
    const currentUrl = page.url();
    console.log(`📍 Post-login URL: ${currentUrl}`);

    // ── Handle device verification ─────────────────────────────
    if (currentUrl.includes('/sessions/verified-device')) {
      console.log('📱 Device verification required — fetching code from Gmail...');

      const code = fetchVerificationCode();

      // Enter the code
      await page.getByLabel('Device Verification Code').fill(code);
      await page.getByRole('button', { name: 'Verify' }).click({ noWaitAfter: true });

      // Wait for redirect to GitHub home
      await page.waitForURL('https://github.com/', { timeout: 15_000 });
      console.log('✅ Device verification passed');
    }

    // ── Check login succeeded ──────────────────────────────────
    const finalUrl = page.url();
    if (!finalUrl.startsWith('https://github.com/') || finalUrl.includes('/login')) {
      await page.screenshot({ path: 'test-results/login-debug.png' });
      console.error('❌ Login still on login page — check test-results/login-debug.png');
      process.exit(1);
    }

    // ── Save browser state ─────────────────────────────────────
    await page.context().storageState({ path: AUTH_FILE });
    console.log(`✅ GitHub auth saved to ${AUTH_FILE}`);
  } finally {
    await browser.close();
  }
}

export default globalSetup;
