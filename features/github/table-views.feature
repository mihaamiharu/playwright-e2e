@github @project @table-views @P1 @serial
Feature: Table & Views

  As a project manager
  I want to view and interact with the project as a table
  So that I can sort, filter, and see all metadata at a glance

  Background:
    Given issue "test" is seeded on the kanban board

  @P1 @table
  Scenario: TBL-01 — Switch to table view and verify columns render
    When I navigate to the table view
    Then I should see the table with columns "Title", "Status", and "Assignees"
    And issue "test" should appear as a row in the table

  @P1 @table
  Scenario: TBL-02 — Sort table by a column and verify order changes
    Given seeded table sort test issues exist with prefixes "AAA" and "ZZZ"
    When I navigate to the table view
    And I sort the table by the "Title" column in ascending order
    Then the "AAA" issue should appear before the "ZZZ" issue in the table
    When I sort the table by the "Title" column in descending order
    Then the "ZZZ" issue should appear before the "AAA" issue in the table

  @P1 @table
  Scenario: TBL-03 — Filter table by a field and verify matching rows
    Given issue "A" exists with status "Backlog" and label "bug" in the sandbox project
    And issue "B" exists with status "Done" and no label in the sandbox project
    When I navigate to the table view
    And I filter the table by label "bug"
    Then issue "A" should be visible in the table
    And issue "B" should not be visible in the table
