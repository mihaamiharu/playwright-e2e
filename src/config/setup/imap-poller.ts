import Imap from 'imap';

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 12;
const CODE_AGE_MS = 10 * 60 * 1000;

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

function isRecentEmail(raw: string): boolean {
  const dateMatch = raw.match(/^Date:\s*(.+)$/m);
  if (!dateMatch) return false;
  const emailDate = new Date(dateMatch[1]).getTime();
  if (isNaN(emailDate)) return false;
  return Date.now() - emailDate < CODE_AGE_MS;
}

function extractCode(raw: string): string | null {
  const decoded = raw.replace(/=([0-9A-F]{2})/g, (_match: string, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  const codeMatch = decoded.match(/Verification code:\s*(\d{6})/);
  return codeMatch ? codeMatch[1] : null;
}

export async function fetchVerificationCode(): Promise<string> {
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
        if (!isRecentEmail(raw)) continue;

        const code = extractCode(raw);
        if (code) {
          console.log(`  📧 Found verification code in recent email`);
          return code;
        }
      }

      if (attempt < MAX_POLLS) {
        console.log(
          `⏳ Recent verification email not yet arrived (attempt ${attempt}/${MAX_POLLS}) — waiting ${POLL_INTERVAL_MS / 1000}s...`,
        );
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
    }

    throw new Error('GitHub verification email never arrived — checked 12 times over ~60s');
  } finally {
    imap!.end();
  }
}
