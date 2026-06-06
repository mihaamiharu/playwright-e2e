@github @project @archive
Feature: Archive & Restore

  As a project contributor
  I want to archive and restore project items
  So that I can clean up the board without deleting issues

  Background:
    Given issue "test" is seeded on the kanban board

  @P2 @archive
  Scenario: ARC-01 — Archive issue from board and verify hidden from active views
    When I archive issue "test" via the API
    And I navigate to the kanban view
    Then issue "test" should not be visible in any column

  @P2 @archive
  Scenario: ARC-02 — Restore archived item and verify it reappears on the board
    When I archive issue "test" via the API
    And I unarchive issue "test" via the API
    And I navigate to the kanban view
    Then issue "test" should reappear on the board
