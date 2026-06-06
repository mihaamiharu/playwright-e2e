@github @project @auto-workflows @P2 @serial
Feature: Auto-Workflows

  As a project maintainer
  I want auto-workflows to update project items automatically
  So that project status stays in sync with issue state

  Background:
    Given issue "test" is seeded on the kanban board

  @P2 @workflows
  Scenario: WFLOW-01 — Close issue via API and verify auto-workflow moves it to Done
    When I close issue "test" for the workflow via API
    Then issue "test" should be moved to "Done" by auto-workflow
