@github @project @ranking @P2
Feature: Ranking

  As a project contributor
  I want to reorder items within a column
  So that I can prioritize work in the backlog

  Background:
    Given a seeded project issue exists on the kanban board

  @P2 @ranking
  Scenario: RANK-01 — Items appear in the backlog column and order can be changed
    Given a second seeded project issue exists on the kanban board with title prefix "ZZZ"
    When I navigate to the kanban view
    Then both the "ZZZ" and seeded issues should appear in the "Backlog" column
