@github @project @board @serial
Feature: Board Workflow (Kanban)

  Background:
    Given issue "test" is seeded on the kanban board

  @P0 @smoke @board
  Scenario: Move issue forward through board statuses (BRD-01)
    When I move issue "test" to "In progress" via API
    And I navigate to the kanban view
    Then issue "test" should appear in the "In progress" column
    When I move issue "test" to "Done" via API
    And I navigate to the kanban view
    Then issue "test" should appear in the "Done" column

  @P1 @board
  Scenario: Move issue backwards on the board (BRD-02)
    When I move issue "test" to "In progress" via API
    And I move issue "test" to "Backlog" via API
    And I navigate to the kanban view
    Then issue "test" should appear in the "Backlog" column

  @P2 @board
  Scenario: Drag-and-drop issue between board columns (BRD-03)
    When I move issue "test" to "Backlog" via API
    And I navigate to the kanban view
    And I drag issue "test" from "Backlog" to "In progress"
    Then issue "test" status should be "In progress" via API
