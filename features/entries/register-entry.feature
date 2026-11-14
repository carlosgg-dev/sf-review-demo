# language: en
Feature: Register a vehicle entry
  The exit booth staff register each vehicle that enters the car park by its licence plate.
  The server records the entry time; the booth cannot set it.
  In a plate written in these scenarios, \uXXXX stands for the single character with that Unicode
  code point, for example \u00A0 for a non-breaking space.

  @issue-1
  Scenario Outline: A vehicle enters and the server records its entry time
    Given the server clock reads "<clock>" in Europe/Madrid
    When the booth registers the entry of plate "1234ABC"
    Then the entry is accepted
    And the response shows plate "1234ABC" entered at "<entered at>"

    Examples:
      | case                         | clock                   | entered at                |
      | winter time                  | 2026-11-13 09:15:00     | 2026-11-13T09:15:00+01:00 |
      | summer time                  | 2026-07-01 09:15:00     | 2026-07-01T09:15:00+02:00 |
      | fraction of a second dropped | 2026-11-13 09:15:00.750 | 2026-11-13T09:15:00+01:00 |

  @issue-1
  Scenario Outline: The plate is recorded in its normalised form
    Given the server clock reads "2026-11-13 09:15:00" in Europe/Madrid
    When the booth registers the entry of plate "<typed plate>"
    Then the entry is accepted
    And the response shows plate "<recorded plate>" entered at "2026-11-13T09:15:00+01:00"

    Examples:
      | case                              | typed plate   | recorded plate |
      | hyphen and lower case             | 1234-abc      | 1234ABC        |
      | spaces                            | 1234 ABC      | 1234ABC        |
      | space written as an escape        | 1234\u0020ABC | 1234ABC        |
      | shortest plate                    | ab            | AB             |
      | longest plate after normalisation | ABCDE-12345   | ABCDE12345     |

  @issue-1
  Scenario: A vehicle already inside cannot enter again and keeps its entry time
    Given the server clock reads "2026-11-13 09:15:00" in Europe/Madrid
    And the booth has registered the entry of plate "1234ABC"
    And the server clock reads "2026-11-13 10:40:00" in Europe/Madrid
    When the booth registers the entry of plate "1234 abc"
    Then the entry is rejected because the vehicle is already inside
    And the vehicle with plate "1234ABC" is recorded as inside since "2026-11-13T09:15:00+01:00"

  @issue-1
  Scenario Outline: A plate that is not valid is rejected
    When the booth registers the entry of plate "<typed plate>"
    Then the entry is rejected because the plate is not valid
    And no vehicle is inside

    Examples:
      | case                                   | typed plate   |
      | forbidden character                    | 12#4          |
      | empty                                  |               |
      | one character                          | A             |
      | one character after normalisation      | 1-            |
      | eleven characters                      | ABCDE123456   |
      | letter outside A-Z                     | ÑAB123        |
      | lower case letter that is not ASCII    | 1234ıbc       |
      | tab                                    | 1234\u0009ABC |
      | non-breaking space                     | 1234\u00A0ABC |
      | en dash                                | 1234\u2013ABC |

  @issue-1
  Scenario Outline: A request that is not well formed is rejected
    When the booth sends an entry request with content type "<content type>" and body '<body>'
    Then the entry is rejected because the request is not valid
    And no vehicle is inside

    Examples:
      | case                     | content type     | body                                                        |
      | the booth sends a time   | application/json | {"plate":"TEST003","enteredAt":"2026-01-01T00:00:00+01:00"} |
      | plate is a number        | application/json | {"plate":1234}                                              |
      | plate is missing         | application/json | {}                                                          |
      | body is not an object    | application/json | ["TEST003"]                                                 |
      | malformed JSON           | application/json | {"plate":"TEST003"                                          |
      | empty body               | application/json |                                                             |
      | content type is not JSON | text/plain       | {"plate":"TEST003"}                                         |

  @issue-1
  Scenario: A body that starts with a byte order mark is accepted
    Given the server clock reads "2026-11-13 09:15:00" in Europe/Madrid
    When the booth registers the entry of plate "TEST003" with a byte order mark before the body
    Then the entry is accepted
    And the response shows plate "TEST003" entered at "2026-11-13T09:15:00+01:00"

  @issue-1
  Scenario Outline: A request to a URL that cannot be decoded is rejected
    When the booth sends the entry of plate "TEST003" to the path "<path>"
    Then the request is rejected because it is not valid, without repeating the URL
    And no vehicle is inside

    Examples:
      | case                                       | path        |
      | unknown path                               | /%c0        |
      | entries path with a byte that is not UTF-8 | /entries%c0 |

  @issue-1
  Scenario: An unexpected failure of the server shows no internal details
    Given the database cannot record entries
    When the booth registers the entry of plate "1234ABC"
    Then the entry fails with an internal error and no internal details

  @issue-1
  Scenario: A failing health check shows no internal details
    Given the database cannot answer
    When the booth checks the health of the server
    Then the request fails with an internal error and no internal details
