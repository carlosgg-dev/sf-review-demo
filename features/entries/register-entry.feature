# language: en
Feature: Register a vehicle entry
  The exit booth staff register each vehicle that enters the car park by its licence plate.
  The server records the entry time; the booth cannot set it.

  Background:
    Given the server clock reads "2026-11-13 09:15:00" in Europe/Madrid

  @issue-1
  Scenario: A vehicle enters and the server records its entry time
    When the booth registers the entry of plate "1234ABC"
    Then the entry is accepted
    And the response shows plate "1234ABC" entered at "2026-11-13T09:15:00+01:00"

  @issue-1
  Scenario: The plate is recorded in its normalised form
    When the booth registers the entry of plate "1234-abc"
    Then the entry is accepted
    And the response shows plate "1234ABC" entered at "2026-11-13T09:15:00+01:00"

  @issue-1
  Scenario: A vehicle already inside cannot enter again
    Given the vehicle with plate "1234ABC" is already inside
    When the booth registers the entry of plate "1234 abc"
    Then the entry is rejected because the vehicle is already inside

  @issue-1
  Scenario: A plate that is not valid is rejected
    When the booth registers the entry of plate "12#4"
    Then the entry is rejected because the plate is not valid
