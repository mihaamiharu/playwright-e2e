@github @project @draft-items @P2
Feature: Draft Items

  As a project contributor
  I want to create draft items and convert them to full issues
  So that I can quickly capture ideas and track them as work items

  Background:
    Given a seeded project issue exists on the kanban board

  @P2 @drafts
  Scenario: DRFT-01 — Create draft item on board and verify it appears without issue number
    When I create a draft issue with title "Draft test item" via the API
    And I navigate to the kanban view
    Then the draft issue should be visible on the board without an issue number

  @P2 @drafts
  Scenario: DRFT-02 — Create draft then full issue and verify issue number appears
    When I create a draft issue with title "Convert me to issue" via the API
    And I create a full issue with the same title via the API
    And I navigate to the kanban view
    Then the issue should be visible with an issue number on the board
