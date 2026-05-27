@github @project @archive
Feature: Archive & Restore

  As a project contributor
  I want to archive and restore project items
  So that I can clean up the board without deleting issues

  Background:
    Given a seeded project issue exists on the kanban board

  @P2
  Scenario: ARC-01 — Archive issue from board and verify hidden from active views
    When I archive the seeded issue via the API
    And I navigate to the kanban view
    Then the seeded issue should not be visible in any column

  @P2
  Scenario: ARC-02 — Restore archived item and verify it reappears on the board
    When I archive the seeded issue via the API
    And I unarchive the seeded issue via the API
    And I navigate to the kanban view
    Then the seeded issue should reappear on the board
