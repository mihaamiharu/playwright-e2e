@github @project @auto-workflows @P2
Feature: Auto-Workflows

  As a project maintainer
  I want auto-workflows to update project items automatically
  So that project status stays in sync with issue state

  Background:
    Given a seeded project issue exists on the kanban board

  Scenario: WFLOW-01 — Close issue via API and verify auto-workflow moves it to Done
    When I close the seeded issue for the workflow via the API
    Then the seeded issue should be moved to "Done" by the auto-workflow
