@github @project @crud
Feature: Issue CRUD

  As a project maintainer
  I want to create issues and track them on the project board
  So that I can manage work items visually

  @P0 @smoke @issues
  Scenario: ISS-01 — Create issue via API and verify it appears on the board
    Given issue "test" is seeded on the kanban board
    When I navigate to the page of issue "test"
    Then I should see the heading of issue "test"
    And I should see the number of issue "test"

  @P1 @issues
  Scenario: ISS-02 — Update issue description and verify in detail view
    Given issue "test" is seeded on the kanban board
    When I update issue "test" description to "Updated by E2E test: new description"
    And I navigate to the page of issue "test"
    Then I should see "Updated by E2E test: new description" in the issue body

  @P1 @issues
  Scenario: ISS-03 — Close issue and verify status badge changes to "Closed"
    Given issue "test" is seeded on the kanban board
    When I close issue "test" via API
    And I navigate to the page of issue "test"
    Then I should see a "Closed" status badge on issue "test"

  @P1 @issues
  Scenario: ISS-04 — Reopen closed issue and verify status restored to "Open"
    Given issue "test" is seeded on the kanban board
    When I close issue "test" via API
    And I reopen issue "test" via API
    And I navigate to the page of issue "test"
    Then I should see a "Open" status badge on issue "test"
