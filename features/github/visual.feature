@github @project @visual @P2
Feature: Visual Regression

  As a QA engineer
  I want baselines of key UI states to detect unintended visual changes
  So that I can catch render regressions before they ship

  Background:
    Given a seeded project issue exists on the kanban board

  Scenario: VIS-01 — Board kanban view matches baseline
    When I navigate to the kanban view
    Then the board kanban columns should match the baseline

  Scenario: VIS-02 — Issue detail page body area matches baseline
    When I navigate to the issue page
    Then the issue body area should match the baseline

  Scenario: VIS-03 — Table layout view matches baseline
    When I navigate to the kanban view
    And I switch to the table layout view
    Then the table view grid should match the baseline
