@github @project @a11y @P2
Feature: Accessibility Checks (WCAG)

  As a QA engineer
  I want to verify key pages meet WCAG A/AA standards
  So that I catch accessibility regressions before users do

  Background:
    Given the persistent test issue is loaded

  @P2 @a11y
  Scenario: A11Y-01 — Board kanban view has no critical WCAG violations
    When I navigate to the kanban view without filter
    Then the page has no critical WCAG violations except "nested-interactive"

  @P2 @a11y
  Scenario: A11Y-02 — Issue detail page has no critical WCAG violations
    When I navigate to the persistent issue page
    Then the page has no critical WCAG violations

  @P2 @a11y
  Scenario: A11Y-03 — Table layout view has no critical WCAG violations
    When I navigate to the kanban view without filter
    And I switch to the table layout view
    Then the page has no critical WCAG violations
