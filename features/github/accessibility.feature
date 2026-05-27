@github @project @a11y @P2
Feature: Accessibility Checks (WCAG)

  As a QA engineer
  I want to verify key pages meet WCAG A/AA standards
  So that we catch accessibility regressions before users do

  Background:
    Given a seeded project issue exists on the kanban board

  Scenario: A11Y-01 — Board kanban view has no critical WCAG violations
    When I navigate to the kanban view
    Then the page has no critical WCAG violations except "nested-interactive"

  Scenario: A11Y-02 — Issue detail page has no critical WCAG violations
    When I navigate to the issue page
    Then the page has no critical WCAG violations

  Scenario: A11Y-03 — Table layout view has no critical WCAG violations
    When I navigate to the kanban view
    And I switch to the table layout view
    Then the page has no critical WCAG violations
