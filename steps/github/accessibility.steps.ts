import { createBdd } from 'playwright-bdd';
import { test } from '../../src/fixtures';
import { runA11y } from '../../src/utils/a11y';

const { Then } = createBdd(test);

Then('the page has no critical WCAG violations', async ({ page }) => {
  await runA11y(page, { disableRules: [] });
});

Then(
  'the page has no critical WCAG violations except {string}',
  async ({ page }, disabledRule: string) => {
    await runA11y(page, { disableRules: [disabledRule] });
  },
);
