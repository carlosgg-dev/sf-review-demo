# Issue 1: register a vehicle entry

## API contract

`POST /entries` with `Content-Type: application/json` (parameters such as `charset=utf-8` allowed)
and the JSON body `{"plate": "<licence plate>"}`.

| Case                                          | Status | Body                                                             |
| --------------------------------------------- | ------ | ---------------------------------------------------------------- |
| Entry registered                              | 201    | `{"plate": "1234ABC", "enteredAt": "2026-11-13T09:15:00+01:00"}` |
| The normalised plate is already inside        | 409    | `{"error": "vehicle_already_inside"}`                            |
| `plate` is a string that is not a valid plate | 400    | `{"error": "invalid_plate"}`                                     |
| The request is not well formed (list below)   | 400    | `{"error": "invalid_request"}`                                   |

A request is not well formed, and gets `400 invalid_request`, when any of these holds:

- the body is missing or empty;
- the body is not valid JSON, for example `{"plate":`;
- the `Content-Type` is missing or is not `application/json`, for example `text/plain`; this is
  400 `invalid_request`, not 415;
- the body is not a JSON object, for example `["1234ABC"]` or `null`;
- `plate` is missing or is not a JSON string, for example `{"plate": 1234}` or `{"plate": null}`;
  values of another type are never converted to a string;
- the body has any field other than `plate`, for example `enteredAt`; extra fields are never
  silently dropped.

Further rules:

- The checks run in this order: well-formed request, then valid plate, then already inside. A
  request that fails a check gets that check's error and records nothing.
- The body accepts no field other than `plate`, so the booth cannot send an entry time.
- `plate` in the response is the normalised plate.
- `enteredAt` is the entry time in Europe/Madrid, as an RFC 3339 date-time with offset and no
  fraction of a second: `+01:00` in winter time, `+02:00` in summer time.

Reason: the booth needs to see the plate as it was recorded and the time it will be charged from. A
stable, machine-readable error code lets the booth tell "already inside" from a typing mistake. 409
and 400 are the standard statuses for a conflict with the current state and for bad input. Every
malformed request, a wrong media type included, shares one status and one code because the booth
handles them the same way, as a fault of its own software; a separate 415 would add a case for the
booth with no different action. Rejecting extra fields and other types, instead of dropping or
converting them, is what makes "the booth cannot send an entry time" hold.

## Licence plate

A plate is checked and normalised in this order:

1. Every character of the plate as sent must be an ASCII letter (`A`-`Z`, `a`-`z`), an ASCII digit
   (`0`-`9`), a space (U+0020) or a hyphen-minus (U+002D). Any other character makes it
   `invalid_plate`: other whitespace such as a tab or a non-breaking space, other dashes, and letters
   outside ASCII such as `Ñ` or `ı`, even when their upper case would be ASCII.
2. Spaces and hyphens are removed, wherever they are.
3. Lower-case letters `a`-`z` become `A`-`Z`.
4. The result must have 2 to 10 characters; otherwise it is `invalid_plate`. An empty plate, or one
   made only of spaces and hyphens, is `invalid_plate`.

Examples: `1234-abc` and `1234 ABC` become `1234ABC`; `ABCDE-12345` becomes `ABCDE12345`;
`1234\tABC` (with a tab), `1234ıbc`, `ÑAB123`, `A`, `1-` and `ABCDE123456` are `invalid_plate`.

Reason: the architecture identifies vehicles by normalised plate; the format must accept foreign
plates, so it does not enforce the Spanish pattern. 10 characters cover European plates. Checking
the characters before any conversion keeps the rule independent of Unicode case mapping, so a
character that is not on a plate can never turn into one that is.

## Entry time

The server takes the entry time from the injected clock at the moment of registration, truncated to
the second: a clock reading `09:15:00.750` gives `09:15:00`, never `09:15:01`. The booth cannot
send it. The offset of `enteredAt` is the one Europe/Madrid has at that instant.

Reason: every fee is calculated from it; whole seconds keep the stored time, the response and the
fee calculation of the check-out issue consistent.

## Data model

A SQLite table `parked_vehicles` holds the vehicles currently inside:

| Column       | Type | Constraint  | Content                                                     |
| ------------ | ---- | ----------- | ----------------------------------------------------------- |
| `plate`      | TEXT | PRIMARY KEY | normalised plate                                            |
| `entered_at` | TEXT | NOT NULL    | entry instant in UTC, RFC 3339, e.g. `2026-11-13T08:15:00Z` |

A registration of a plate already in the table fails and leaves the existing row unchanged. The
duplicate check relies on the primary key, not on a previous read, so two simultaneous entries of
the same plate cannot both succeed. The table is created at start-up when it does not exist.

Reason: the table models the current state "inside the car park", which is all this issue and the
check-out need; check-out will remove the row. History is out of scope. Storing UTC instants avoids
ambiguous local times at daylight saving changes; the conversion to Europe/Madrid happens on output
and in the fee calculation.
