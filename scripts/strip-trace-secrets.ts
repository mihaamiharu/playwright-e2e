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
import { join, extname, basename, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const DIRS = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['reports/allure/results'];

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

      let content: string;
      try {
        content = readFileSync(entryPath, 'utf-8');
        if (content.includes('\x00')) continue;
      } catch {
        continue;
      }

      if (!hasSecret(content)) continue;
      writeFileSync(entryPath, redactSecrets(content));
      modified = true;
    }

    if (modified) {
      const abs = resolve(zipPath);
      unlinkSync(abs);
      execSync(`cd "${tmp}" && zip -r "${abs}" .`, { stdio: 'ignore' });
    }
    return modified;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function scanDir(dir: string): { zips: number; files: number } {
  if (!existsSync(dir)) {
    console.log(`[sanitize] Directory not found: ${dir}`);
    return { zips: 0, files: 0 };
  }

  console.log(`[sanitize] Scanning ${dir}...`);
  const files = walk(dir);
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

  return { zips, files: filesScanned };
}

let totalZips = 0;
let totalFiles = 0;

for (const dir of DIRS) {
  const { zips, files } = scanDir(dir);
  totalZips += zips;
  totalFiles += files;
}

console.log(
  `[sanitize] Done — ${totalZips} zip(s) sanitized, ${totalFiles} file(s) redacted across ${DIRS.length} director${DIRS.length === 1 ? 'y' : 'ies'}`,
);
