# language: en
Feature: Calculate the exit fee at the day rate
  When a vehicle leaves, the exit booth staff get the fee it must pay and its stay is closed.
  The first 30 minutes are free; after that, each hour or fraction costs 2.50 €.
  The server records the exit time; the booth cannot set it. Fees are in euro cents.

  @issue-2
  Scenario Outline: A vehicle leaves, the booth gets its fee and the stay is closed
    Given the server clock reads "<entry clock>" in Europe/Madrid
    And the booth has registered the entry of plate "1234ABC"
    And the server clock reads "<exit clock>" in Europe/Madrid
    When the booth registers the exit of plate "1234ABC"
    Then the exit is accepted
    And the response shows plate "1234ABC" entered at "<entered at>", exited at "<exited at>" with a fee of <fee> cents
    And no vehicle is inside

    Examples:
      | case        | entry clock         | exit clock          | entered at                | exited at                 | fee |
      | winter time | 2026-11-13 09:00:00 | 2026-11-13 11:15:00 | 2026-11-13T09:00:00+01:00 | 2026-11-13T11:15:00+01:00 | 500 |
      | summer time | 2026-07-01 09:00:00 | 2026-07-01 11:15:00 | 2026-07-01T09:00:00+02:00 | 2026-07-01T11:15:00+02:00 | 500 |

  @issue-2
  Scenario: The booth can type the plate in any accepted form at the exit
    Given the server clock reads "2026-11-13 09:00:00" in Europe/Madrid
    And the booth has registered the entry of plate "1234ABC"
    And the server clock reads "2026-11-13 09:20:00" in Europe/Madrid
    When the booth registers the exit of plate "1234-abc"
    Then the exit is accepted
    And the response shows plate "1234ABC" entered at "2026-11-13T09:00:00+01:00", exited at "2026-11-13T09:20:00+01:00" with a fee of 0 cents
    And no vehicle is inside

  @issue-2
  Scenario Outline: The fee is free for 30 minutes and then 2.50 € per hour or fraction
    Given a vehicle entered at "2026-11-13 09:00:00" in Europe/Madrid
    When it leaves at "<exit clock>" in Europe/Madrid
    Then the fee is <fee> cents

    Examples:
      | case                                 | exit clock              | fee  |
      | leaves at once                       | 2026-11-13 09:00:00     | 0    |
      | exactly 30 minutes                   | 2026-11-13 09:30:00     | 0    |
      | one second over 30 minutes           | 2026-11-13 09:30:01     | 250  |
      | exactly one block                    | 2026-11-13 10:30:00     | 250  |
      | one second into the second block     | 2026-11-13 10:30:01     | 500  |
      | fraction of a second dropped at exit | 2026-11-13 10:30:00.900 | 250  |
      | three hours and a quarter            | 2026-11-13 12:15:00     | 750  |
      | seven hours                          | 2026-11-13 16:00:00     | 1750 |

  @issue-2
  Scenario: A vehicle that is not inside cannot leave
    When the booth registers the exit of plate "1234ABC"
    Then the exit is rejected because the vehicle is not inside

  @issue-2
  Scenario: A vehicle that has already left cannot leave again
    Given the server clock reads "2026-11-13 09:00:00" in Europe/Madrid
    And the booth has registered the entry of plate "1234ABC"
    And the booth has registered the exit of plate "1234ABC"
    When the booth registers the exit of plate "1234ABC"
    Then the exit is rejected because the vehicle is not inside

  @issue-2
  Scenario: A vehicle that has left can enter again
    Given the server clock reads "2026-11-13 09:00:00" in Europe/Madrid
    And the booth has registered the entry of plate "1234ABC"
    And the booth has registered the exit of plate "1234ABC"
    And the server clock reads "2026-11-13 12:00:00" in Europe/Madrid
    When the booth registers the entry of plate "1234ABC"
    Then the entry is accepted
    And the response shows plate "1234ABC" entered at "2026-11-13T12:00:00+01:00"

  @issue-2
  Scenario: A plate that is not valid is rejected at the exit
    Given the server clock reads "2026-11-13 09:00:00" in Europe/Madrid
    And the booth has registered the entry of plate "1234ABC"
    When the booth registers the exit of plate "12#4"
    Then the exit is rejected because the plate is not valid
    And the vehicle with plate "1234ABC" is recorded as inside since "2026-11-13T09:00:00+01:00"

  @issue-2
  Scenario Outline: An exit request that is not well formed is rejected
    Given the server clock reads "2026-11-13 09:00:00" in Europe/Madrid
    And the booth has registered the entry of plate "TEST003"
    When the booth sends an exit request with content type "<content type>" and body '<body>'
    Then the exit is rejected because the request is not valid
    And the vehicle with plate "TEST003" is recorded as inside since "2026-11-13T09:00:00+01:00"

    Examples:
      | case                     | content type     | body                                                       |
      | the booth sends a time   | application/json | {"plate":"TEST003","exitedAt":"2026-11-13T09:10:00+01:00"} |
      | plate is a number        | application/json | {"plate":1234}                                             |
      | plate is missing         | application/json | {}                                                         |
      | malformed JSON           | application/json | {"plate":"TEST003"                                         |
      | content type is not JSON | text/plain       | {"plate":"TEST003"}                                        |

  @issue-2
  Scenario: An unexpected failure at the exit shows no internal details and keeps the vehicle inside
    Given the server clock reads "2026-11-13 09:00:00" in Europe/Madrid
    And the booth has registered the entry of plate "1234ABC"
    And the database cannot record exits
    When the booth registers the exit of plate "1234ABC"
    Then the exit fails with an internal error and no internal details
    And the vehicle with plate "1234ABC" is recorded as inside since "2026-11-13T09:00:00+01:00"
