@github @project @labels @P1 @serial
Feature: Labels & Metadata

  As a project maintainer
  I want to add, view, and remove labels on issues
  So that I can categorize and filter work items

  Background:
    Given a seeded project issue exists on the kanban board

  @P1 @labels
  Scenario: LBL-01 — Add label via UI and verify it renders
    When I navigate to the issue page
    And I add the label "bug" via the UI
    Then I should see the "bug" label on the issue

  @P1 @labels
  Scenario: LBL-02 — Add multiple labels via UI and verify all render
    When I navigate to the issue page
    And I add the label "bug" via the UI
    And I add the label "enhancement" via the UI
    Then I should see the "bug" label on the issue
    And I should see the "enhancement" label on the issue

  @P1 @labels
  Scenario: LBL-03 — Remove label via UI and verify it disappears
    When I add the label "bug" via the API
    And I navigate to the issue page
    And I remove the label "bug" via the UI
    Then I should not see the "bug" label on the issue

  @P1 @labels
  Scenario: LBL-04 — Filter board by label and verify only matching issues shown
    When I add the label "bug" via the API
    And I seed a second unlabeled issue on the board
    And I navigate to the kanban view
    And I filter the board by the label "bug"
    Then the seeded issue should be visible on the board
    And the second unlabeled issue should not be visible on the board
