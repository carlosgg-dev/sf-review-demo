# Issue 1: register a vehicle entry

## API contract

`POST /entries` with the JSON body `{"plate": "<licence plate>"}`.

| Case                                                                        | Status | Body                                                             |
| --------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| Entry registered                                                            | 201    | `{"plate": "1234ABC", "enteredAt": "2026-11-13T09:15:00+01:00"}` |
| The normalised plate is already inside                                      | 409    | `{"error": "vehicle_already_inside"}`                            |
| `plate` is a string that is not a valid plate                               | 400    | `{"error": "invalid_plate"}`                                     |
| Body not a JSON object, `plate` missing or not a string, or any other field | 400    | `{"error": "invalid_request"}`                                   |

- The body accepts no field other than `plate`, so the booth cannot send an entry time.
- `plate` in the response is the normalised plate.
- `enteredAt` is the entry time in Europe/Madrid, as an RFC 3339 date-time with offset and no
  fraction of a second.

Reason: the booth needs to see the plate as it was recorded and the time it will be charged from. A
stable, machine-readable error code lets the booth tell "already inside" from a typing mistake. 409
and 400 are the standard statuses for a conflict with the current state and for bad input.

## Licence plate

A plate is normalised by removing spaces and hyphens and converting it to upper case. After
normalisation it is valid when it has 2 to 10 characters, each an ASCII letter `A`-`Z` or a digit.

Reason: the architecture identifies vehicles by normalised plate; the format must accept foreign
plates, so it does not enforce the Spanish pattern. 10 characters cover European plates.

## Entry time

The server takes the entry time from the injected clock at the moment of registration, truncated to
the second. The booth cannot send it.

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
