@github @project @saved-views @P2
Feature: Saved Views

  As a project contributor
  I want to create, switch, and persist saved views with filters
  So that I can quickly access different perspectives on project data

  Background:
    Given a seeded project issue exists on the kanban board

  Scenario: VIEW-01 — Create saved view with filter and verify persistence after reload
    When I navigate to the kanban view
    And I create a new board view named "E2E Test View"
    And I filter the current view by "Status" with value "Backlog"
    And I reload the page
    Then the current view should show filter "Status" with value "Backlog"
    And the created view tab should be visible

  Scenario: VIEW-02 — Switch between saved views and verify correct view is displayed
    When I navigate to the kanban view
    And I switch to the "Priority board" view
    Then the current view tab should be named "Priority board"
    When I switch to the "Backlog" view
    Then the current view tab should be named "Backlog"
