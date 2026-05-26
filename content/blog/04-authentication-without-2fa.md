# Authentication Without the 2FA Nightmare

> **Part 4 of the Playwright E2E series.**
> [Part 1](/blog/01-why-real-websites.md) — Why real websites beat demo apps
> [Part 2](/architecture-tour) — Architecture of a production-grade E2E suite
> [Part 3](/fixtures-over-basetest) — Why fixtures over BaseTest

---

## The problem: every test run looks like a hacker

The first time I ran a Playwright test against GitHub, it worked perfectly — for about 30 seconds. Then the test runner logged:

```
After login attempt, URL: https://github.com/sessions/verified-device
```

GitHub had flagged my headless Chromium session as an unrecognized device. A 6-digit verification code was sitting in my inbox. My automated test suite was asking me to check my email manually. That's not automation — that's a script that requires a human babysitter.

This is the authentication problem every real-website E2E test suite eventually hits:

| Challenge | Why it matters |
|-----------|----------------|
| **Device verification** | GitHub treats every headless browser as a new device |
| **2FA / 2SV** | Accounts with enhanced security can't do simple password login |
| **Session expiry** | Storage state eventually expires — usually at 3 AM during a CI run |
| **Test account hygiene** | You need a dedicated account, but giving it full permissions is risky |

This article walks through the solution I built: a **two-credential authentication pattern** that handles device verification automatically, caches sessions across test runs, and requires zero manual intervention.

---

## The two-credential pattern

The core insight is simple: **browser login and API calls serve different purposes, so they use different credentials.**

| Purpose | Credential | Owner |
|---------|-----------|-------|
| Browser login (view boards, click buttons) | `GITHUB_USERNAME` + `GITHUB_PASSWORD` | Dedicated test account |
| API calls (create issues, manage projects) | `GITHUB_API_TOKEN` | Repo owner (full access) |

The test account logs into the browser to verify UI state. The repo owner's API token does the heavy data setup and cleanup. They can be from different GitHub accounts — and in practice, they should be.

```env
# .env — gitignored, never committed
GITHUB_USERNAME=ekkisyam23
GITHUB_PASSWORD=***
GITHUB_API_TOKEN=ghp_***
```

Here's why the split matters:

- **The test account has zero real permissions.** It's a collaborator on exactly one test repo and one kanban board. If credentials leak, there's no blast radius.
- **The API token has full access**, but it never goes through a browser. It's used exclusively via REST and GraphQL in fixture code — no login page, no device verification, no headless browser detected.
- **The browser never sees the API token**, and the API never sees the browser password. A compromise of one doesn't expose the other.

---

## How Playwright sessions work

Playwright has a built-in mechanism for this: **storage state**. When you save `page.context().storageState({ path: 'auth/state.json' })`, you get a JSON file containing the browser's cookies and localStorage.

Every subsequent test can load that state:

```typescript
// playwright.config.ts
export default defineConfig({
  globalSetup: './src/config/global-setup.ts',
  use: {
    storageState: 'auth/github.json',
  },
});
```

The global setup script runs once before all tests. It:

1. Checks if `auth/github.json` already exists — if so, skips login entirely
2. Otherwise, logs into GitHub with the test account credentials
3. Saves the session to `auth/github.json`
4. Every test worker loads that cached session

This means the full login flow (including device verification) only happens when the cache is missing — first run on a new machine, after session expiry, or after manually clearing the cache.

---

## The device verification wall

The tricky part is step 2. GitHub's device verification page looks like this:

```
┌─────────────────────────────────────┐
│ Device verification                 │
│                                     │
│ We just sent your authentication    │
│ code via email to k****@gmail.com   │
│                                     │
│ [Device Verification Code]          │
│                                     │
│ [Verify]                            │
│                                     │
│ Re-send the code                    │
│ Try GitHub Mobile                   │
└─────────────────────────────────────┘
```

The code arrives in an email with this format:

```
From: GitHub <noreply@github.com>
Subject: [GitHub] Please verify your device

Hey ekkisyam23!

A sign in attempt requires further verification...
Device: Chrome on Linux
Verification code: 454367
```

The solution is to **read the verification code from the inbox programmatically**, then enter it back into the browser. This is where the **Gmail App Password** comes in.

### Gmail App Passwords

An App Password is a 16-character token you generate in your Google Account settings (Security → 2-Step Verification → App Passwords). It acts as a Gmail-specific password for IMAP access, with no access to anything else in your account.

Generate one specifically for "Mail" on "Other (Custom name)" — I called mine `Playwright E2E Auth`.

```
App password: ygsk dhhp gplg tmex
```

This goes into `.env` alongside the GitHub credentials:

```env
GMAIL_ADDRESS=kikkawa23@gmail.com
GMAIL_APP_PASSWORD=ygsk dhhp gplg tmex
```

Never hardcode this. Never commit it. The `.env` file is gitignored.

---

## Wiring the auto-fetch into global-setup

With the email accessible via IMAP, the global setup script becomes:

```typescript
import { chromium } from '@playwright/test';
import { ImapFlow } from 'imapflow';
import dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
const AUTH_FILE = 'auth/github.json';

async function globalSetup() {
  // Skip if already cached
  if (fs.existsSync(AUTH_FILE)) {
    console.log('✅ Auth state found — skipping login');
    return;
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('https://github.com/login');

  // Fill credentials and submit
  await page.getByLabel('Username or email address').fill(GITHUB_USERNAME);
  await page.getByLabel('Password').fill(GITHUB_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(3000);

  // Handle device verification if triggered
  if (page.url().includes('/sessions/verified-device')) {
    const code = await fetchVerificationCode();  // reads Gmail via IMAP
    await page.getByLabel('Device Verification Code').fill(code);
    await page.getByRole('button', { name: 'Verify' }).click({ noWaitAfter: true });
    await page.waitForURL('https://github.com/');
  }

  // Save session for all future test runs
  await page.context().storageState({ path: AUTH_FILE });
  await browser.close();
}
```

The `fetchVerificationCode()` function uses **imapflow** — a Node.js IMAP client that integrates directly into the script with no external dependencies:

```typescript
import { ImapFlow } from 'imapflow';

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
    const lock = await client.getMailboxLock('INBOX');
    try {
      // Gmail raw search — precise FROM matching
      const uids = await client.search({
        gmraw: 'from:(noreply@github.com)',
      });

      if (!uids || uids.length === 0) {
        throw new Error('GitHub verification email not found');
      }

      // Check the most recent email
      const latest = uids[uids.length - 1];
      const msg = await client.fetchOne(
        latest,
        { source: { maxLength: 100_000 } },
        { uid: true },
      );

      if (!msg?.source) throw new Error('Could not read email');

      const src = msg.source.toString();
      // Decode quoted-printable (GitHub uses =XX encoding)
      const decoded = src.replace(
        /=([0-9A-F]{2})/g,
        (_, hex) => String.fromCharCode(parseInt(hex, 16)),
      );

      const codeMatch = decoded.match(/Verification code:\s*(\d{6})/);
      if (!codeMatch) throw new Error('Code not found in email');
      return codeMatch[1];
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}
```

If the email hasn't arrived yet (GitHub can take a few seconds), the script polls every 5 seconds for up to 60 seconds before giving up. This is handled by a simple retry loop around the search logic.

### One dependency, zero configuration

No CLI to install, no config file to set up, no shell commands to source the password. Just `npm install --save-dev imapflow` and the Gmail App Password in `.env`:

---

## What the first run looks like

```
$ npx playwright test tests/example.spec.ts

✅ Auth state found — skipping login
```

...wait, that's the **second** run. On the very first run, the output is more interesting:

```
📍 Post-login URL: https://github.com/sessions/verified-device
📱 Device verification required — fetching code from Gmail...
✅ Found verification email (ID: 5604) — code: 447991
✅ Device verification passed
✅ GitHub auth saved to auth/github.json

Running 1 test using 1 worker
  ✓  1 [chromium] › example › playwright is configured correctly (596ms)
```

The entire flow — browser login → detect verification → fetch code from email → enter code → pass verification → save session → run tests — completes in under 10 seconds with zero manual intervention.

After that, every subsequent run skips login entirely. The cached session in `auth/github.json` is loaded directly by Playwright's `storageState`. If the session ever expires (typically after days or weeks), the test fails with an auth error, you delete `auth/github.json`, and the next run does the full flow again.

---

## Edge cases we solved along the way

### "Sign in" matches two elements

GitHub's login page has both a submit button and a passkey button with the same accessible name:

```typescript
// ❌ Strict mode violation — resolves to 2 elements
page.getByRole('button', { name: 'Sign in' })

// ✅ Matches only the submit input
page.getByRole('button', { name: 'Sign in', exact: true })
```

Always use `exact: true` on GitHub's login page.

### Verification code expires

GitHub's verification codes are time-sensitive — they expire in about 15 minutes. The polling loop has a 45-second window, which is generous enough for email delivery latency but well within the code's validity period.

### Page navigation during click

When entering the verification code and clicking Verify, GitHub immediately redirects to the home page. Playwright's `click()` auto-waits for navigation, which can time out if the redirect happens before click's internal navigation listener is ready. The fix is `{ noWaitAfter: true }`:

```typescript
await page.getByRole('button', { name: 'Verify' }).click({ noWaitAfter: true });
await page.waitForURL('https://github.com/');  // handle navigation explicitly
```

---

## Security checklist

| Rule | Implementation |
|------|---------------|
| Never commit credentials | `.env` in `.gitignore` |
| Never hardcode in source | All creds via `process.env` |
| Never store in config files | `backend.auth.cmd` reads from `.env` at runtime |
| Use a dedicated test account | Zero blast radius if credentials leak |
| Split browser + API credentials | Different accounts, different purposes |
| .gitignore auth state | `auth/*.json` is gitignored (contains session cookies) |

---

## What we gained

The authentication setup is invisible to anyone running the test suite. They clone the repo, add a `.env` file, and run `npx playwright test`. The first run handles device verification silently. Every subsequent run loads the cached session. No manual steps, no documentation to follow, no "ask a teammate for the password."

This is the difference between a test suite that's theoretically automated and one that actually runs unattended. The device verification wall stops most Playwright projects targeting GitHub. Once you automate past it, the rest of the suite can focus on what actually matters — testing the application, not fighting the login page.

---

## What's next

Authentication is the prerequisite. Now that we can reliably log in and stay logged in, the real work begins:

- [Part 5](/blog/05-api-and-ui-hybrid-tests) — Testing APIs and UI in the same test
- Part 6 — Visual regression for sites you don't control
- Part 7 — Flaky tests aren't a Playwright problem
- Part 8 — CI/CD for real-world E2E at scale

---

*Part 4 of the Playwright E2E series. [Browse the full repo →](https://github.com/mihaamiharu/playwright-e2e)*
