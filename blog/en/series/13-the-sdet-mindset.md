# The SDET Mindset: Architecting Automation Like Software

When manual QA engineers try to transition into test automation, they usually start by asking the wrong question: _"Which tool should I learn?"_

They spend hours watching YouTube tutorials on Playwright, Selenium, or Cypress. They learn how to use `page.click()` and `page.locator()`. They practice on demo websites, successfully log in, and feel like they have finally become automation engineers.

Then they get their first real project.

Suddenly, the locators they learned don't work because CSS classes are dynamically hashed by React. The tests fail randomly because of rate limiting or two-factor authentication. Worst of all, the test suite becomes an unmaintainable mess of flaky scripts that take hours to run and constantly fail due to "stale data."

What happened?

They fell for the illusion of automation. They thought automation was about learning a tool. **In reality, automation is about learning test architecture.**

I built a production-grade E2E framework testing one of the most complex, highly dynamic applications on the internet: **GitHub Projects**. After fully automating 37 complex business scenarios against a live production environment, I want to share the core mindset shift required to move from writing "test scripts" to architecting a "test framework."

---

## 1. The Bridge: Behavior vs. Implementation

The most powerful realization for a manual tester is that **you already possess the most difficult skill in automation**: knowing _what_ to test.

The problem arises when we try to mix _what_ we are testing (the behavior) with _how_ we are testing it (the implementation). When you write a script full of `page.click('.btn-primary')` directly inside your test logic, you are coupling your business requirements tightly to the UI. If the UI changes, your test logic breaks.

The SDET (Software Engineer in Test) mindset solves this through abstraction, most commonly using **Behavior-Driven Development (BDD)**.

Instead of thinking about locators, we separate our concerns. We define the behavior in plain English (Gherkin):

```gherkin
Scenario: Update issue description
  Given a seeded project issue exists on the kanban board
  When I update the issue description to "Updated description"
  Then I should see "Updated description" in the issue body
```

This is the bridge. The Gherkin file is the conceptual agreement of the behavior. The implementation—the Playwright code—lives completely hidden behind the scenes in Step Definitions and Page Objects.

You don't need to be a coding wizard to design the behavior. A mature framework allows you to architect the test visually and conceptually before a single line of automation code is executed.

---

## 2. The State Problem: Why UI Testing Fails

If separating behavior from implementation is the first step, mastering **State Management** is the quantum leap.

Why do E2E tests flake? The most common culprit isn't a slow framework or a UI glitch. **It's because the test assumed a perfect starting state.**

Imagine testing a "Delete User" function. A junior automation engineer will write a test that logs in, clicks "Create User", fills out a 10-field form, clicks save, navigates back to the user list, and _then_ clicks delete.

What happens if the "Create User" form has a bug? The "Delete User" test fails. This is a false negative. The delete function might be working perfectly, but you coupled its success to the UI creation flow.

The SDET mindset demands **Test Isolation**. A test should never rely on the UI to set up its own preconditions unless the UI setup itself is what is being explicitly tested.

---

## 3. Bypassing the UI: The Power of API Seeding

How do we achieve true Test Isolation without spending 20 minutes creating test data manually? We bypass the UI entirely and use APIs.

In my GitHub Projects framework, I use GitHub's **GraphQL API** to "seed" the database instantly.

If my test requires an issue to be in the "In Progress" Kanban column, I do not write a test that drags and drops the card. Instead, I architect a Playwright Fixture that sends a GraphQL mutation to the server before the test even starts.

1. **Seed (API):** A fast, deterministic GraphQL call creates the issue and moves it to the correct column in 200 milliseconds.
2. **Verify (UI):** Playwright opens the browser, navigates directly to the specific issue, and verifies the UI behavior we actually care about.
3. **Cleanup (API):** Crucially, the framework uses a Last-In-First-Out (LIFO) queue to send another API request to delete the issue after the test finishes, _even if the test failed_.

By treating the API as our primary setup tool, our tests become bulletproof. They are isolated, deterministic, and lightning-fast. The UI is only used to verify UI behavior, never for data state management.

---

## Conclusion: Embrace the SDET Mindset

Transitioning to an SDET is a philosophical shift.

It's not about memorizing the syntax for clicking a button. It's about looking at a testing problem and asking:

- _How do I decouple this behavior from the UI implementation?_
- _How do I ensure this test runs in complete isolation?_
- _How can I manage the data lifecycle so this test doesn't pollute the environment?_

When you stop treating automation as a recording of manual steps, and start treating it as a software engineering project, you leave "The Demo App Trap" behind for good.

If you want to see exactly how these concepts are implemented in code—including the BDD architecture, the GraphQL data seeding, and the CI/CD pipelines—check out the open-source reference architecture repository here:

🔗 [mihaamiharu/playwright-e2e](https://github.com/mihaamiharu/playwright-e2e)
