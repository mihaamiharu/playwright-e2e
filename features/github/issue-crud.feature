@github @project @crud
Feature: Issue CRUD

  As a project maintainer
  I want to create issues and track them on the project board
  So that I can manage work items visually

  Scenario: ISS-01 — Create issue via API and verify it appears on the board
    Given a seeded project issue exists on the kanban board
    When I navigate to the issue page
    Then I should see the issue heading
    And I should see the issue number in the header

  @P1 @CWF
  Scenario: ISS-02 — Update issue description and verify in detail view
    Given a seeded project issue exists on the kanban board
    When I update the issue description to "Updated by E2E test: new description"
    And I navigate to the issue page
    Then I should see "Updated by E2E test: new description" in the issue body

  @P1
  Scenario: ISS-03 — Close issue and verify status badge changes to "Closed"
    Given a seeded project issue exists on the kanban board
    When I close the issue via API
    And I navigate to the issue page
    Then I should see a "Closed" status badge

  @P1
  Scenario: ISS-04 — Reopen closed issue and verify status restored to "Open"
    Given a seeded project issue exists on the kanban board
    When I close the issue via API
    And I reopen the issue via API
    And I navigate to the issue page
    Then I should see a "Open" status badge
