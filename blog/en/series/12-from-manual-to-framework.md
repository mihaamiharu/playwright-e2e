# From Manual Test Cases to 37 Automated Scenarios: Building a Production-Grade Playwright Framework

If you are a manual QA engineer trying to transition into test automation, you have probably fallen into **"The Demo App Trap."**

You go to YouTube, find a tutorial, and watch an instructor automate a login page on `demo.playwright.dev` or `the-internet.herokuapp.com`. It looks so easy. You use a locator like `page.locator('#username')`, click a button, and the test passes. You feel like an automation engineer.

Then you get a job testing a real, modern web application.

Suddenly, you realize that **demo apps are designed to be tested, but real apps fight back.** The challenges are completely unpredictable. CSS classes are dynamically hashed (`.css-1f9j8k`), buttons are buried inside deeply nested Web Components, login requires 2FA device verification, and your tests fail randomly because the database is full of leftover garbage data. You don't get to choose your architecture; the system's restrictions dictate it for you.

Demo apps teach you syntax. **Real websites teach you how to solve unpredictable engineering problems.**

I decided to build a production-grade E2E framework targeting one of the most complex, highly dynamic applications on the internet: **GitHub Projects (Kanban Boards)**.

I automated **37 complete business scenarios**—from creating issues and dragging Kanban cards to intercepting GraphQL requests.

This post is going to show you exactly how to cross the bridge from writing manual test cases to writing professional, scalable Playwright code. We'll start simple, and then we'll dive deep into the engineering patterns that separate a "test script" from a "test framework."

---

## 🌉 The Bridge: From Manual QA to Automation

The biggest misconception beginners have is that automation is just "writing code that clicks things." In reality, automation is just the **execution** of your manual test design.

To prove this, let's look at a standard manual test case for updating a GitHub Issue:

### Step 1: The Manual Test Case

> **Title:** Verify user can update an issue description
> **Precondition:** An issue exists on the project board.
> **Steps:**
>
> 1. Open the issue page.
> 2. Click edit and change the description to "Updated by E2E test".
> 3. Save the description.
>    **Expected Result:** The issue detail view shows the updated description text.

### Step 2: The BDD Translation (Gherkin)

If you can write the test case above, you already know how to write Behaviour-Driven Development (BDD) scenarios. We use `playwright-bdd` to write our tests in plain English using Gherkin syntax (`.feature` files).

Here is that exact manual test case translated into our framework:

```gherkin
Scenario: ISS-02 — Update issue description and verify in detail view
  Given a seeded project issue exists on the kanban board
  When I update the issue description to "Updated by E2E test: new description"
  And I navigate to the issue page
  Then I should see "Updated by E2E test: new description" in the issue body
```

Notice how readable this is. Your Product Manager, your manual QA team, and your Developers can all read this file and know exactly what is being tested.

### Step 3: The Playwright Code (Step Definitions)

So how does the computer know how to "navigate to the issue page"? We write **Step Definitions**.

Thanks to the **Page Object Model (POM)** pattern, our step definitions contain almost no complex Playwright locator logic. They just call human-readable methods on our page classes:

```typescript
// steps/github/issue-crud.steps.ts
import { createBdd } from 'playwright-bdd';
import { test } from '../../src/fixtures';

const { When, Then } = createBdd(test);

When('I navigate to the issue page', async ({ issuePage, seededProjectIssue }) => {
  // We use the issue number from our seeded data to build the URL
  await issuePage.navigateTo(env.github.testRepo, seededProjectIssue.number);
});

Then('I should see {string} in the issue body', async ({ issuePage }, expectedText: string) => {
  // The POM handles the complex locators behind the scenes
  await issuePage.expectBodyText(expectedText);
});
```

That's the bridge. You define the behavior in English, and you map that behavior to reusable Page Objects.

But wait... where did `seededProjectIssue` come from? How did the issue get created in the first place?

This brings us to the advanced engineering that keeps this framework from collapsing.

---

## 🛠️ The SDET Flex: Data State & GraphQL Seeding

In junior automation frameworks, tests are often dependent on the UI for setup. To test if you can _update_ an issue, a beginner will write a test that clicks "New Issue", types a title, clicks "Submit", and _then_ tries to update it.

This is a massive anti-pattern. If the "New Issue" button breaks, your "Update Issue" test fails, even though the update functionality might be working perfectly! UI interactions are slow and flaky.

**As a Software Engineer in Test (SDET), my rule is: If you aren't explicitly testing the UI creation flow, bypass the UI entirely.**

To achieve this, we use Playwright **Fixtures** combined with GitHub's **GraphQL API** to "seed" our test data instantly before the test even starts.

### The GraphQL API Client

This is where the system forced my hand. GitHub Projects V2 doesn't have a REST API, which meant I couldn't use standard HTTP calls to seed my data. To survive this unpredictable system restriction, I had to adapt and build a custom typed GraphQL client within the framework (`src/utils/api/github-graphql.ts`).

Instead of clicking through the UI to move a card to a specific Kanban column, we just send a GraphQL mutation:

```typescript
// Inside GitHubProjectsAPI class
public async moveItemToStatus(
  projectId: string,
  itemId: string,
  fieldId: string,
  optionId: string
): Promise<void> {
  return test.step('GitHub GraphQL: move item to status', async () => {
    const query = `
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId,
          itemId: $itemId,
          fieldId: $fieldId,
          value: { singleSelectOptionId: $optionId }
        }) {
          projectV2Item { id }
        }
      }
    `;
    // Execute the raw GraphQL fetch under the hood
    await this.graphql(query, { projectId, itemId, fieldId, optionId });
  });
}
```

### Injecting State with Playwright Fixtures

We take that API client and wrap it in a Playwright Fixture called `seededProjectIssue`.

When Playwright sees that our test requires `seededProjectIssue`, it runs the setup code _before_ our test starts:

1. Creates an issue via REST API.
2. Adds it to the Project Board via GraphQL.
3. Injects the Issue ID and Number directly into our test.
4. **Registers a cleanup callback** (LIFO queue) to delete the issue after the test finishes, even if the test fails.

Because of this architecture, our tests are **deterministic**. Every single test starts with a clean slate, creates exactly the data it needs via lightning-fast API calls, interacts with the UI only for the specific steps it needs to verify, and then cleans up after itself.

---

## ⚙️ The CI/CD Flex: Re-run Failed Only & Auth Caching

Architecting a framework locally is one thing; making it survive in CI/CD is another.

When tests fail in the pipeline, most QA engineers just click "Re-run all jobs". If your suite takes 30 minutes, you are wasting time and computing resources.

In `.github/workflows/e2e-full.yml`, I engineered a pipeline that automatically detects if you clicked "Re-run failed jobs" (`github.run_attempt > 1`). If you did, it uses the GitHub CLI to download the `.last-run.json` test cache from the previous attempt. It then passes the `--last-failed` flag to Playwright, running _only_ the tests that failed previously.

But wait—what about authentication? If the pipeline runs a second time, won't GitHub block the headless browser with a 2FA prompt again?

To solve this, the pipeline encrypts the `auth/github.json` state using `openssl` and saves it to the GitHub Actions cache. When a rerun happens, it decrypts the auth state. Playwright resumes the session instantly without ever seeing a login screen or polling an IMAP inbox.

This is the difference between a test script and an SDET architecture.

---

## 🚀 Conclusion

Moving from manual testing to automation is a mindset shift. It's not about learning how to record clicks; it's about learning how to architect software that verifies behavior.

By treating your test framework like a real production application—using BDD for communication, Page Objects for maintainability, and API Fixtures for data state—you guarantee that your tests will survive the harsh reality of modern web development.

Want to see all 37 scenarios, the GraphQL integrations, and the CI/CD pipeline in action?

**Check out the full repository here:**  
🔗 [mihaamiharu/playwright-e2e](https://github.com/mihaamiharu/playwright-e2e)

Clone it, run `npm test`, and explore how a real-world Playwright framework handles production targets.

Happy testing!
