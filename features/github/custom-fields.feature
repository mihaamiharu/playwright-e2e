@github @project @custom-fields
Feature: Custom Fields

  As a project contributor
  I want to set and filter by custom field values
  So that I can track metadata like priority and estimate

  Background:
    Given a seeded project issue exists on the kanban board

  @P1
  Scenario: FLD-01 — Set custom field value via API and verify in table view
    When I set the "Priority" field to "P0" on the seeded issue via the API
    And I navigate to the kanban view
    And I switch to the table layout view
    Then the seeded issue should show "P0" in the "Priority" column

  @P2
  Scenario: FLD-02 — Filter table by custom field value
    Given a seeded project issue exists on the kanban board
    And issue "A" exists with "Priority" set to "P0" in the sandbox project
    And issue "B" exists with "Priority" set to "P1" in the sandbox project
    When I navigate to the kanban view
    And I switch to the table layout view
    And I filter the table by "Priority" "P0"
    Then custom issue "A" should be visible in the table
    And custom issue "B" should not be visible in the table
