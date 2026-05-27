import { chromium, type FullConfig } from '@playwright/test';
import Imap from 'imap';
import dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const AUTH_FILE = 'auth/github.json';
const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 12; // ~60 seconds total
const GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';

function connectImap(user: string, pass: string): Promise<Imap> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user,
      password: pass,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: !process.env.CI },
    });

    imap.once('ready', () => resolve(imap));
    imap.once('error', reject);
    imap.connect();
  });
}

function openInbox(imap: Imap): Promise<Imap> {
  return new Promise((resolve, reject) => {
    imap.openBox('INBOX', true, (err) => {
      if (err) reject(err);
      else resolve(imap);
    });
  });
}

function searchGitHubEmails(imap: Imap): Promise<number[]> {
  return new Promise((resolve, reject) => {
    imap.search([['FROM', 'noreply@github.com']], (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

function fetchMessageSource(imap: Imap, seqno: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const f = imap.fetch([seqno], { bodies: '' });
    let body = '';
    f.on('message', (msg) => {
      msg.on('body', (stream) => {
        stream.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
      });
      msg.once('attributes', () => {});
      msg.once('end', () => {});
    });
    f.once('error', reject);
    f.once('end', () => resolve(body));
  });
}

/**
 * Fetch the latest GitHub device verification code from Gmail via IMAP.
 * Polls up to ~60s, waiting for the email to arrive.
 */
async function fetchVerificationCode(): Promise<string> {
  const user = process.env.GMAIL_ADDRESS;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      'GMAIL_ADDRESS and GMAIL_APP_PASSWORD must be set in .env for IMAP device verification',
    );
  }

  let imap: Imap;
  try {
    imap = await connectImap(user, pass);
  } catch (err) {
    throw new Error(
      `IMAP connection to Gmail failed — check GMAIL_ADDRESS and GMAIL_APP_PASSWORD in .env: ${String(err)}`,
    );
  }

  try {
    await openInbox(imap);

    for (let attempt = 1; attempt <= MAX_POLLS; attempt++) {
      const results = await searchGitHubEmails(imap);

      if (!results.length) {
        if (attempt < MAX_POLLS) {
          console.log(
            `⏳ Verification email not yet arrived (attempt ${attempt}/${MAX_POLLS}) — waiting ${POLL_INTERVAL_MS / 1000}s...`,
          );
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          continue;
        }
        throw new Error('GitHub verification email never arrived — checked 12 times over ~60s');
      }

      const recent = results.slice(-5).reverse();
      for (const seqno of recent) {
        const raw = await fetchMessageSource(imap, seqno);
        if (!raw) continue;

        // Decode quoted-printable encoding (GitHub uses =XX for special chars)
        const decoded = raw.replace(/=([0-9A-F]{2})/g, (_match: string, hex: string) =>
          String.fromCharCode(parseInt(hex, 16)),
        );

        const codeMatch = decoded.match(/Verification code:\s*(\d{6})/);
        if (codeMatch) {
          return codeMatch[1];
        }
      }

      if (attempt < MAX_POLLS) {
        console.log(
          `⏳ GitHub verification email found but code not ready yet (attempt ${attempt}/${MAX_POLLS}) — retrying...`,
        );
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
    }

    throw new Error('GitHub verification email never arrived — checked 12 times over ~60s');
  } finally {
    imap!.end();
  }
}

async function graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const token = process.env.GH_API_TOKEN;
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const body: unknown = await response.json();
  const { data, errors } = body as { data?: T; errors?: Array<{ message: string }> };
  if (errors) throw new Error(errors.map((e) => e.message).join('; '));
  return data as T;
}

/**
 * One-time check to ensure the sandbox project has all fields required by tests.
 * Runs only on first-run (when auth isn't cached). Idempotent — skips fields that already exist.
 */
async function ensureSandboxFields(): Promise<void> {
  const token = process.env.GH_API_TOKEN;
  const owner = process.env.GH_TEST_REPO_OWNER;
  const projectNumber = parseInt(process.env.GH_PROJECT_SANDBOX_NUMBER || '1', 10);

  if (!token || !owner) {
    console.log('  ⏭️  Sandbox check skipped — GH_API_TOKEN or GH_TEST_REPO_OWNER not set');
    return;
  }

  console.log(`\n🔧 Verifying sandbox project fields...`);

  try {
    // Get project ID
    const projData = await graphql<{ user: { projectV2: { id: string } | null } }>(
      `
        query ($owner: String!, $projectNumber: Int!) {
          user(login: $owner) {
            projectV2(number: $projectNumber) {
              id
            }
          }
        }
      `,
      { owner, projectNumber },
    );
    const projectId = projData.user?.projectV2?.id;
    if (!projectId) {
      console.warn(`  ⚠️  Sandbox project #${projectNumber} not found for "${owner}"`);
      return;
    }

    // Get existing fields
    const fieldsData = await graphql<{
      node: { fields: { nodes: Array<{ __typename: string; name: string }> } };
    }>(
      `
        query ($projectId: ID!) {
          node(id: $projectId) {
            ... on ProjectV2 {
              fields(first: 20) {
                nodes {
                  __typename
                  name
                }
              }
            }
          }
        }
      `,
      { projectId },
    );

    const existingNames = new Set(fieldsData.node.fields.nodes.map((f) => f.name));

    // Check Iteration field — only one we need to potentially create (others already exist)
    if (existingNames.has('Iteration')) {
      console.log('  ✅ Iteration field exists');
    } else {
      console.log('  ➕ Creating Iteration field...');
      try {
        await graphql(
          `
            mutation ($projectId: ID!) {
              createProjectV2Field(
                input: {
                  projectId: $projectId
                  name: "Iteration"
                  dataType: ITERATION
                  iterationConfiguration: {
                    startDate: "2026-06-01"
                    duration: 14
                    iterations: [
                      { title: "Sprint 1", duration: 14, startDate: "2026-06-01" }
                      { title: "Sprint 2", duration: 14, startDate: "2026-06-15" }
                    ]
                  }
                }
              ) {
                projectV2Field {
                  ... on ProjectV2IterationField {
                    id
                  }
                }
              }
            }
          `,
          { projectId },
        );
        console.log('  ✅ Iteration field created');
      } catch (err) {
        console.warn(`  ⚠️  Could not create Iteration field: ${err}`);
      }
    }

    console.log('  ✅ Sandbox fields verified\n');
  } catch (err) {
    console.warn(`  ⚠️  Sandbox check failed (non-fatal): ${err}`);
  }
}

async function globalSetup(_config: FullConfig) {
  // Skip login if storage state already exists
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
      console.log('📱 Device verification required — fetching code from Gmail via IMAP...');

      const code = await fetchVerificationCode();

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

    // ── One-time sandbox field check ────────────────────────────
    await ensureSandboxFields();
  } finally {
    await browser.close();
  }
}

export default globalSetup;
