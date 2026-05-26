@github @project @milestones @P1
Feature: Milestones

  As a project maintainer
  I want to group issues under milestones with due dates
  So that I can track progress towards release goals

  Background:
    Given a seeded project issue exists on the kanban board

  Scenario: MIL-01 — Create milestone with due date and verify in issue sidebar
    When I create a milestone with a due date via the API
    And I link the seeded issue to the milestone via the API
    And I navigate to the issue page
    Then I should see the milestone name in the issue sidebar

  Scenario: MIL-02 — Link issues to milestone and verify progress bar
    When I create a milestone with a due date via the API
    And I link the seeded issue to the milestone via the API
    And I seed a second issue on the board linked to the milestone
    And I close the seeded issue via the API
    And I navigate to the milestone page
    Then I should see the milestone progress bar showing partial completion
