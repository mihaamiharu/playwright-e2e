import { chromium, type FullConfig } from '@playwright/test';
import { ImapFlow } from 'imapflow';
import dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const AUTH_FILE = 'auth/github.json';
const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 12; // ~60 seconds total

/**
 * Fetch the latest GitHub device verification code from Gmail via IMAP.
 * Polls up to ~60s, waiting for the email to arrive.
 */
async function fetchVerificationCode(): Promise<string> {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.GMAIL_ADDRESS!,
      pass: process.env.GMAIL_APP_PASSWORD!,
    },
    logger: false,
  });

  await client.connect();

  try {
    for (let attempt = 1; attempt <= MAX_POLLS; attempt++) {
      const lock = await client.getMailboxLock('INBOX');
      try {
        // Gmail raw search — precise FROM matching
        const uidList = await client.search({
          gmraw: 'from:(noreply@github.com)',
        });

        if (!uidList || uidList.length === 0) {
          if (attempt < MAX_POLLS) {
            console.log(
              `⏳ Verification email not yet arrived (attempt ${attempt}/${MAX_POLLS}) — waiting ${POLL_INTERVAL_MS / 1000}s...`,
            );
            await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
            continue;
          }
          throw new Error(
            'GitHub verification email never arrived — checked 12 times over ~60s',
          );
        }

        // Check the most recent emails from GitHub (look back up to 5)
        const recentUids = uidList.slice(-5).reverse();
        for (const uid of recentUids) {
          const msg = await client.fetchOne(
            uid,
            { source: { maxLength: 100_000 } },
            { uid: true },
          );

          if (!msg || !msg.source) continue;

          const src = msg.source.toString();
          // Decode quoted-printable encoding (GitHub uses =XX for special chars)
          const decoded = src.replace(
            /=([0-9A-F]{2})/g,
            (_match: string, hex: string) =>
              String.fromCharCode(parseInt(hex, 16)),
          );

          const codeMatch = decoded.match(/Verification code:\s*(\d{6})/);
          if (codeMatch) {
            return codeMatch[1];
          }
        }

        // Found GitHub emails but none had a verification code yet — poll again
        if (attempt < MAX_POLLS) {
          console.log(
            `⏳ GitHub verification email found but code not ready yet (attempt ${attempt}/${MAX_POLLS}) — retrying...`,
          );
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        }
      } finally {
        lock.release();
      }
    }

    throw new Error(
      'GitHub verification email never arrived — checked 12 times over ~60s',
    );
  } finally {
    await client.logout();
  }
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
    console.warn(
      '⚠️  GITHUB_USERNAME or GITHUB_PASSWORD not set — skipping auth setup',
    );
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
    await page
      .getByRole('button', { name: 'Sign in', exact: true })
      .click();

    // Wait to see where we land
    await page.waitForTimeout(3000);
    const currentUrl = page.url();
    console.log(`📍 Post-login URL: ${currentUrl}`);

    // ── Handle device verification ─────────────────────────────
    if (currentUrl.includes('/sessions/verified-device')) {
      console.log(
        '📱 Device verification required — fetching code from Gmail via IMAP...',
      );

      const code = await fetchVerificationCode();

      // Enter the code
      await page.getByLabel('Device Verification Code').fill(code);
      await page
        .getByRole('button', { name: 'Verify' })
        .click({ noWaitAfter: true });

      // Wait for redirect to GitHub home
      await page.waitForURL('https://github.com/', { timeout: 15_000 });
      console.log('✅ Device verification passed');
    }

    // ── Check login succeeded ──────────────────────────────────
    const finalUrl = page.url();
    if (
      !finalUrl.startsWith('https://github.com/') ||
      finalUrl.includes('/login')
    ) {
      await page.screenshot({ path: 'test-results/login-debug.png' });
      console.error(
        '❌ Login still on login page — check test-results/login-debug.png',
      );
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
