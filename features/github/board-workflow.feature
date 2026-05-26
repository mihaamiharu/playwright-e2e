@github @project @board
Feature: Board Workflow (Kanban)

  Background:
    Given a seeded project issue exists on the kanban board

  @P0
  Scenario: Move issue forward through board statuses (BRD-01)
    When I move the issue to "In progress" via the project API
    And I navigate to the kanban view
    Then the issue should appear in the "In progress" column
    When I move the issue to "Done" via the project API
    And I navigate to the kanban view
    Then the issue should appear in the "Done" column

  @P1
  Scenario: Move issue backwards on the board (BRD-02)
    When I move the issue to "In progress" via the project API
    And I move the issue to "Backlog" via the project API
    And I navigate to the kanban view
    Then the issue should appear in the "Backlog" column

  @P2
  Scenario: Drag-and-drop issue between board columns (BRD-03)
    When I move the issue to "Backlog" via the project API
    And I navigate to the kanban view
    And I drag the issue from "Backlog" to "In progress"
    Then the issue status should be "In progress" via the API
