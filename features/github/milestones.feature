@github @project @milestones @P1 @serial
Feature: Milestones

  As a project maintainer
  I want to group issues under milestones with due dates
  So that I can track progress towards release goals

  Background:
    Given issue "test" is seeded on the kanban board

  @P1 @milestones
  Scenario: MIL-01 — Create milestone with due date and verify in issue sidebar
    When I create a milestone with a due date via the API
    And I link issue "test" to the milestone via the API
    And I navigate to the page of issue "test"
    Then I should see the milestone name in the issue sidebar

  @P1 @milestones
  Scenario: MIL-02 — Link issues to milestone and verify progress bar
    When I create a milestone with a due date via the API
    And I link issue "test" to the milestone via the API
    And I seed a second issue on the board linked to the milestone
    And I close issue "test" via API
    And I navigate to the milestone page
    Then I should see the milestone progress bar showing partial completion

  @P2 @milestones
  Scenario: MIL-03 — Close milestone and verify "Completed" status and 100% progress
    When I create a milestone with a due date via the API
    And I link issue "test" to the milestone via the API
    And I seed a second issue on the board linked to the milestone
    And I close issue "test" via API
    And I close the second issue via the API
    And I close the milestone via the API
    And I navigate to the milestone page
    Then the milestone should show completed status and full progress
