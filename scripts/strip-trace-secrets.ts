import {
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  rmSync,
} from 'node:fs';
import { join, extname, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const RESULTS_DIR = process.argv[2] || 'reports/allure/results';

const SECRET_PATTERNS = [
  /ghp_[0-9a-zA-Z]{36}/g,
  /gho_[0-9a-zA-Z]{36}/g,
  /ghu_[0-9a-zA-Z]{36}/g,
  /ghs_[0-9a-zA-Z]{36}/g,
  /ghr_[0-9a-zA-Z]{36}/g,
  /github_pat_[0-9a-zA-Z]{82}/g,
];

const TEXT_EXTS = new Set([
  '.json',
  '.txt',
  '.html',
  '.xml',
  '.log',
  '.md',
  '.csv',
  '.yaml',
  '.yml',
]);

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      files.push(...walk(p));
    } else {
      files.push(p);
    }
  }
  return files;
}

function hasSecret(value: string): boolean {
  return SECRET_PATTERNS.some((p) => {
    p.lastIndex = 0;
    return p.test(value);
  });
}

function redactSecrets(value: string): string {
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    value = value.replace(pattern, (m) => `${m.slice(0, 4)}_REDACTED`);
  }
  return value;
}

function sanitizeFile(p: string): boolean {
  try {
    const content = readFileSync(p, 'utf-8');
    if (!hasSecret(content)) return false;
    writeFileSync(p, redactSecrets(content));
    return true;
  } catch {
    return false;
  }
}

function sanitizeZip(zipPath: string): boolean {
  const tmp = mkdtempSync(join(tmpdir(), 'zip-sanitize-'));
  let modified = false;
  try {
    execSync(`unzip -o "${zipPath}" -d "${tmp}"`, { stdio: 'ignore' });

    for (const entry of readdirSync(tmp)) {
      const entryPath = join(tmp, entry);
      if (!statSync(entryPath).isFile()) continue;

      if (!TEXT_EXTS.has(extname(entry))) continue;

      const content = readFileSync(entryPath, 'utf-8');
      if (!hasSecret(content)) continue;
      writeFileSync(entryPath, redactSecrets(content));
      modified = true;
    }

    if (modified) {
      unlinkSync(zipPath);
      execSync(`cd "${tmp}" && zip -r "${zipPath}" .`, { stdio: 'ignore' });
    }
    return modified;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (!existsSync(RESULTS_DIR)) {
  console.log(`[sanitize] Directory not found: ${RESULTS_DIR}`);
  process.exit(0);
}

console.log(`[sanitize] Scanning ${RESULTS_DIR}...`);
const files = walk(RESULTS_DIR);
let zips = 0;
let filesScanned = 0;

for (const f of files) {
  if (extname(f) === '.zip') {
    if (sanitizeZip(f)) {
      console.log(`  [sanitize] Stripped secrets from ${basename(f)}`);
      zips++;
    }
  } else if (TEXT_EXTS.has(extname(f))) {
    if (sanitizeFile(f)) {
      console.log(`  [sanitize] Redacted secrets in ${basename(f)}`);
      filesScanned++;
    }
  }
}

console.log(`[sanitize] Done — ${zips} zip(s) sanitized, ${filesScanned} file(s) redacted`);
