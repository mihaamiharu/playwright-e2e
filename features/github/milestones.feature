@github @project @milestones @P1 @serial
Feature: Milestones

  As a project maintainer
  I want to group issues under milestones with due dates
  So that I can track progress towards release goals

  Background:
    Given a seeded project issue exists on the kanban board

  @P1 @milestones
  Scenario: MIL-01 — Create milestone with due date and verify in issue sidebar
    When I create a milestone with a due date via the API
    And I link the seeded issue to the milestone via the API
    And I navigate to the issue page
    Then I should see the milestone name in the issue sidebar

  @P1 @milestones
  Scenario: MIL-02 — Link issues to milestone and verify progress bar
    When I create a milestone with a due date via the API
    And I link the seeded issue to the milestone via the API
    And I seed a second issue on the board linked to the milestone
    And I close the seeded issue via the API
    And I navigate to the milestone page
    Then I should see the milestone progress bar showing partial completion

  @P2 @milestones
  Scenario: MIL-03 — Close milestone and verify "Completed" status and 100% progress
    When I create a milestone with a due date via the API
    And I link the seeded issue to the milestone via the API
    And I seed a second issue on the board linked to the milestone
    And I close the seeded issue via the API
    And I close the second issue via the API
    And I close the milestone via the API
    And I navigate to the milestone page
    Then the milestone should show completed status and full progress
