@github @project @assignees @P1
Feature: Assignees

  As a project maintainer
  I want to assign and unassign issues to team members
  So that I can track ownership and filter work by assignee

  Background:
    Given issue "test" is seeded on the kanban board

  @P1 @assignees
  Scenario: ASN-01 — Assign issue to user via API and verify on issue page
    When I assign issue "test" to myself via the API
    And I navigate to the page of issue "test"
    Then I should see myself as the assignee on the issue

  @P2 @assignees
  Scenario: ASN-02 — Unassign issue and verify assignee cleared
    When I assign issue "test" to myself via the API
    And I unassign issue "test" via the API
    And I navigate to the page of issue "test"
    Then I should see no assignee on the issue

  @P1 @assignees
  Scenario: ASN-03 — Filter board by assignee and verify only assigned issues shown
    Given issue "assigned" is seeded on the kanban board
    When I assign issue "assigned" to myself via the API
    And issue "unassigned" is seeded on the kanban board
    And I navigate to the kanban view
    And I filter the board by assignee "Has assignee"
    Then issue "assigned" should be visible on the board
    And issue "unassigned" should not be visible on the board
