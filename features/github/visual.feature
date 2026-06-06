@github @project @visual @P2 @serial
Feature: Visual Regression

  As a QA engineer
  I want baselines of key UI states to detect unintended visual changes
  So that I can catch render regressions before they ship

  Background:
    Given the persistent test issue is loaded

  @P2 @visual
  Scenario: VIS-01 — Board kanban view matches baseline
    When I navigate to the kanban view without filter
    Then the board kanban columns should match the baseline

  @P2 @visual
  Scenario: VIS-02 — Issue detail page body area matches baseline
    When I navigate to the persistent issue page
    Then the issue body area should match the baseline

  @P2 @visual
  Scenario: VIS-03 — Table layout view matches baseline
    When I navigate to the table view without filter
    Then the table view grid should match the baseline
