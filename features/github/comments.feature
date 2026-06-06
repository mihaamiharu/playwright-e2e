@github @project @comments
Feature: Comments

  As a project contributor
  I want to add and edit comments on issues
  So that I can collaborate on work items

  Background:
    Given issue "test" is seeded on the kanban board

  @P1 @comments
  Scenario: CMT-01 — Add comment via API and verify it appears in the timeline
    When I add comment "CMT-01 test comment from E2E" to issue "test" via the API
    And I navigate to the page of issue "test"
    Then I should see the comment "CMT-01 test comment from E2E" on the issue

  @P2 @comments
  Scenario: CMT-02 — Edit comment via API and verify updated text appears
    Given a comment exists on issue "test" with text "Original comment text"
    When I update the comment to "Updated comment text" via the API
    And I navigate to the page of issue "test"
    Then I should see "Updated comment text" in the comments
    And I should not see "Original comment text" on the page
