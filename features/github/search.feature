@github @project @search @P1 @serial
Feature: In-Project Search

  As a project contributor
  I want to search issues within a project by keyword
  So that I can quickly find specific work items

  Background:
    Given issue "test" is seeded on the kanban board

  @P1 @search
  Scenario: SRCH-01 — Search issues within project by keyword → verify matching results shown
    Given issue "keyword" is seeded on the kanban board
    When I navigate to the kanban view
    And I search the project by title for issue "keyword"
    Then issue "keyword" should be visible on the board
    And issue "test" should not be visible on the board
