@github @project @custom-fields @serial
Feature: Custom Fields

  As a project contributor
  I want to set and filter by custom field values
  So that I can track metadata like priority and estimate

  Background:
    Given issue "test" is seeded on the kanban board

  @P1 @fields
  Scenario: FLD-01 — Set custom field value via API and verify in table view
    When I set the "Priority" field to "P0" on issue "test" via the API
    And I navigate to the table view
    Then issue "test" should show "P0" in the "Priority" column

  @P2 @fields
  Scenario: FLD-02 — Filter table by custom field value
    Given the following issues exist with "Priority" values in the sandbox project:
      | key | Priority |
      | A   | P0       |
      | B   | P1       |
    When I navigate to the table view
    And I filter the table by "Priority" "P0"
    Then issue "A" should be visible in the table
    And issue "B" should not be visible in the table
