import { allure } from 'allure-playwright';

const SEVERITY_MAP = {
  P0: 'blocker',
  P1: 'critical',
  P2: 'normal',
  P3: 'minor',
} as const;

const EPIC_MAP: Record<string, string> = {
  project: 'GitHub Projects V2',
  authentication: 'Authentication & Access',
};

/**
 * Parses Playwright/BDD tags (e.g. ["@P0", "@smoke"])
 * and maps priority tags to structured Allure levels.
 */
export async function attachAllureLabels(
  tags: string[],
  testInfo?: { title: string; titlePath: string[] },
): Promise<void> {
  // Always attach owner and repo link
  await allure.owner('Ekki Syam');
  await allure.link('https://github.com/mihaamiharu/github-projects-e2e', 'Repository', 'custom');

  if (tags && tags.length > 0) {
    for (const tag of tags) {
      const cleanTag = tag.startsWith('@') ? tag.slice(1) : tag;
      const uppercaseTag = cleanTag.toUpperCase();

      if (uppercaseTag in SEVERITY_MAP) {
        await allure.severity(SEVERITY_MAP[uppercaseTag as keyof typeof SEVERITY_MAP]);
      }

      if (cleanTag in EPIC_MAP) {
        await allure.epic(EPIC_MAP[cleanTag]);
      }
    }
  }

  // Map Feature: line → allure.feature()
  if (testInfo?.titlePath?.[2]) {
    await allure.feature(testInfo.titlePath[2]);
  }

  // Map scenario name → allure.story()
  if (testInfo?.title) {
    await allure.story(testInfo.title);
  }
}
