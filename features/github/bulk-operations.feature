@github @project @bulk-operations @P1 @serial
Feature: Bulk Operations

  As a project manager
  I want to update multiple issues at once
  So that I can efficiently manage sprint planning

  Background:
    Given a seeded project issue exists on the kanban board

  @P1 @bulk
  Scenario: BULK-01 — Seed multiple issues → bulk update status via API → verify all changed
    Given a second seeded project issue exists on the kanban board
    When I bulk move both seeded issues to "In progress" via the API
    And I navigate to the kanban view
    Then both seeded issues should appear in the "In progress" column
