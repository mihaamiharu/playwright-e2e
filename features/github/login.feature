@github @authentication
Feature: GitHub Login

  As a GitHub user
  I want to log in to my account
  So that I can access my repositories and dashboard

  Background:
    Given I am on the GitHub login page

  @P0 @smoke
  Scenario: Login with valid credentials
    When I enter valid credentials
    And I submit the login form
    Then I should be redirected to the dashboard

  @P1
  Scenario: Login fails with wrong password
    When I enter username "test-user" and password "wrong-password"
    And I submit the login form
    Then I should see an error message "Incorrect username or password"

  @P1
  Scenario: Login fails with empty credentials
    When I submit the form without entering credentials
    Then the form should not submit
