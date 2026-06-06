@github @project @labels @P1 @serial
Feature: Labels & Metadata

  As a project maintainer
  I want to add, view, and remove labels on issues
  So that I can categorize and filter work items

  Background:
    Given issue "test" is seeded on the kanban board

  @P1 @labels
  Scenario: LBL-01 — Add label via UI and verify it renders
    When I navigate to the page of issue "test"
    And I add the label "bug" via the UI
    Then I should see the "bug" label on the issue

  @P1 @labels
  Scenario: LBL-02 — Add multiple labels via UI and verify all render
    When I navigate to the page of issue "test"
    And I add the following labels via the UI:
      | label       |
      | bug         |
      | enhancement |
    Then the following labels should be visible on the issue:
      | label       |
      | bug         |
      | enhancement |

  @P1 @labels
  Scenario: LBL-03 — Remove label via UI and verify it disappears
    When I add label "bug" to issue "test" via the API
    And I navigate to the page of issue "test"
    And I remove the label "bug" via the UI
    Then I should not see the "bug" label on the issue

  @P1 @labels
  Scenario: LBL-04 — Filter board by label and verify only matching issues shown
    Given issue "labeled" is seeded on the kanban board
    When I add label "bug" to issue "labeled" via the API
    And issue "unlabeled" is seeded on the kanban board
    And I navigate to the kanban view
    And I filter the board by the label "bug"
    Then issue "labeled" should be visible on the board
    And issue "unlabeled" should not be visible on the board
