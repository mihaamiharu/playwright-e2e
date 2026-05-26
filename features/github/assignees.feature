@github @project @assignees @P1
Feature: Assignees

  As a project maintainer
  I want to assign and unassign issues to team members
  So that I can track ownership and filter work by assignee

  Background:
    Given a seeded project issue exists on the kanban board

  Scenario: ASN-01 — Assign issue to user via API and verify on issue page
    When I assign the issue to myself via the API
    And I navigate to the issue page
    Then I should see myself as the assignee on the issue

  @P2
  Scenario: ASN-02 — Unassign issue and verify assignee cleared
    When I assign the issue to myself via the API
    And I unassign the issue via the API
    And I navigate to the issue page
    Then I should see no assignee on the issue

  Scenario: ASN-03 — Filter board by assignee and verify only assigned issues shown
    When I assign the issue to myself via the API
    And I seed a second unassigned issue on the board
    And I navigate to the kanban view
    And I filter the board by assignee "Has assignee"
    Then the seeded issue should be visible on the board
    And the second unassigned issue should not be visible on the board
