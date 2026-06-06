@github @project @bulk-operations @P1 @serial
Feature: Bulk Operations

  As a project manager
  I want to update multiple issues at once
  So that I can efficiently manage sprint planning

  @P1 @bulk
  Scenario: BULK-01 — Seed multiple issues → bulk update status via API → verify all changed
    Given issue "first" is seeded on the kanban board
    And issue "second" is seeded on the kanban board
    When I bulk move issues "first" and "second" to "In progress" via the API
    And I navigate to the kanban view
    Then issues "first" and "second" should appear in the "In progress" column
