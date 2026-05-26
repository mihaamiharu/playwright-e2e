@github @project @search @P1
Feature: In-Project Search

  As a project contributor
  I want to search issues within a project by keyword
  So that I can quickly find specific work items

  Background:
    Given a seeded project issue exists on the kanban board

  Scenario: SRCH-01 — Search issues within project by keyword → verify matching results shown
    Given a second project issue exists with a unique search keyword in the title
    When I navigate to the kanban view
    And I search the project by title for the unique keyword
    Then the issue with the keyword should be visible on the board
    And the seeded issue without the keyword should not be visible
