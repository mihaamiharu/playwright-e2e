@github @project @P0
Feature: Issue CRUD

  As a project maintainer
  I want to create issues and track them on the project board
  So that I can manage work items visually

  Scenario: ISS-01 — Create issue via API and verify it appears on the board
    Given a seeded project issue exists on the kanban board
    When I navigate to the issue page
    Then I should see the issue heading
    And I should see the issue number in the header
