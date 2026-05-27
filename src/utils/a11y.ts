import AxeBuilder from '@axe-core/playwright';

type ViolationImpact = 'critical' | 'serious' | 'moderate' | 'minor';

const DEFAULT_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const DEFAULT_FAIL_ON: ViolationImpact[] = ['critical', 'serious'];

export interface A11yOptions {
  /** CSS selectors to exclude from analysis */
  exclude?: string[];
  /** Axe rule IDs to skip */
  disableRules?: string[];
  /** WCAG conformance tags (default: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']) */
  tags?: string[];
  /** Violation levels that should fail the test (default: ['critical', 'serious']) */
  failOn?: ViolationImpact[];
}

/**
 * Run accessibility checks on the current page state.
 *
 * - Injects axe-core and runs WCAG A/AA analysis by default
 * - Fails on critical + serious violations (configurable via options.failOn)
 * - Logs all violation details to console for reporting
 *
 * @example
 *   Then('the page has no critical WCAG violations', async ({ page }) => {
 *     await runA11y(page);
 *   });
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runA11y(page: any, options: A11yOptions = {}) {
  const {
    exclude = [],
    disableRules = [],
    tags = DEFAULT_TAGS,
    failOn = DEFAULT_FAIL_ON,
  } = options;

  let builder = new AxeBuilder({ page }).withTags(tags).disableRules(disableRules);

  for (const sel of exclude) {
    builder = builder.exclude(sel);
  }

  const results = await builder.analyze();

  console.log(
    `[a11y] ${results.violations.length} violation(s), ${results.passes.length} pass(es), ${results.incomplete.length} incomplete`,
  );

  const failing = results.violations.filter((v) => failOn.includes(v.impact as ViolationImpact));
  const warnings = results.violations.filter((v) => !failOn.includes(v.impact as ViolationImpact));

  for (const w of warnings) {
    console.warn(`[a11y:warn] ${w.impact}: ${w.help} (${w.id}) — ${w.nodes.length} node(s)`);
  }

  if (failing.length > 0) {
    const details = failing
      .map(
        (v) => `  - [${v.impact}] ${v.help} (${v.id}) — ${v.nodes.length} node(s) | ${v.helpUrl}`,
      )
      .join('\n');
    throw new Error(`Accessibility violations found (${failing.length} failing):\n${details}`);
  }
}
