import fs from 'fs';
import path from 'path';
import type { BrowserContext } from '@playwright/test';

const AUTH_PATH = path.resolve('auth/github.json');

export async function ensureAuthCookies(context: BrowserContext): Promise<void> {
  try {
    const raw = fs.readFileSync(AUTH_PATH, 'utf-8');
    const { cookies } = JSON.parse(raw);
    if (cookies?.length) {
      await context.addCookies(cookies);
    }
  } catch {
    // Auth file may not exist on first run without global-setup
  }
}
