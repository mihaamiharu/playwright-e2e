import { allure } from 'allure-playwright';

const SEVERITY_MAP: Record<string, 'blocker' | 'critical' | 'normal' | 'minor' | 'trivial'> = {
  P0: 'blocker',
  P1: 'normal',
  P2: 'minor',
};

/**
 * Parses Playwright/BDD tags (e.g. ["@P0", "@smoke"])
 * and maps priority tags (P0/P1/P2) to structured Allure severity levels.
 */
export async function attachAllureLabels(tags: string[]): Promise<void> {
  if (!tags || tags.length === 0) return;

  for (const tag of tags) {
    // Strip leading '@' if present (Playwright tags may or may not retain it)
    const cleanTag = tag.startsWith('@') ? tag.slice(1) : tag;
    const uppercaseTag = cleanTag.toUpperCase();

    if (uppercaseTag in SEVERITY_MAP) {
      await allure.severity(SEVERITY_MAP[uppercaseTag]);
    }
  }
}
