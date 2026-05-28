@github @project @date-iteration @P2
# StepDeps: board-workflow.steps.ts ("I navigate to the kanban view"),
#           table-views.steps.ts ("I switch to the table layout view",
#           "the seeded issue should appear as a row in the table")
Feature: Date & Iteration Fields

  As a project contributor
  I want to set date and iteration fields on issues
  So that I can track deadlines and sprint assignments

  Background:
    Given a seeded project issue exists on the kanban board

  Scenario: TDATE-01 — Set date field and verify it renders in table view
    When I set the "Target date" field to "2026-12-31" on the seeded issue via the API
    And the "Target date" field value should be "2026-12-31" on the seeded issue via the API
    And I navigate to the kanban view
    And I switch to the table layout view
    Then the seeded issue should appear as a row in the table

  @P2
  Scenario: ITER-01 — Set iteration field and verify it appears on the board card
    When I set the "Iteration" field to "Sprint 1" on the seeded issue via the API
    And the "Iteration" field value should be "Sprint 1" on the seeded issue via the API
    And I navigate to the kanban view
    Then the seeded issue should be visible on the board
