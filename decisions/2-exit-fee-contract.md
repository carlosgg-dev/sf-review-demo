# Issue 2: calculate the exit fee at the day rate

This decision reuses the API conventions of `decisions/1-register-entry-contract.md` and only states
what the exit adds or changes. Where it says "as in decision 1", every rule of that section applies
to `POST /exits` word for word, with "exit" in place of "entry".

## API contract

`POST /exits` with `Content-Type: application/json` and the JSON body `{"plate": "<licence plate>"}`.
The body is read exactly as the body of `POST /entries`: charset, byte order mark, bytes that are not
valid UTF-8, a repeated `plate` key and the query string follow the rules of decision 1.

| Case                                          | Status | Body                              |
| --------------------------------------------- | ------ | --------------------------------- |
| Exit registered and fee calculated            | 200    | the exit, below                   |
| The normalised plate is not inside            | 409    | `{"error": "vehicle_not_inside"}` |
| `plate` is a string that is not a valid plate | 400    | `{"error": "invalid_plate"}`      |
| The request is not well formed                | 400    | `{"error": "invalid_request"}`    |
| The body is larger than 1 MiB                 | 413    | `{"error": "invalid_request"}`    |
| Unknown route or method                       | 404    | `{"error": "not_found"}`          |
| Unexpected failure of the server              | 500    | `{"error": "internal_error"}`     |

The exit registered:

```json
{
  "plate": "1234ABC",
  "enteredAt": "2026-11-13T09:00:00+01:00",
  "exitedAt": "2026-11-13T11:15:00+01:00",
  "feeCents": 500
}
```

- `plate` is the normalised plate, as in decision 1.
- `enteredAt` is the entry time recorded at registration, in the format of decision 1.
- `exitedAt` is the exit time, in the same format: Europe/Madrid, RFC 3339 with the offset Madrid has
  at that instant and no fraction of a second.
- `feeCents` is the fee in euro cents, a JSON integer: `500` is 5.00 €. A free stay is `0`.
- The body has exactly these four fields.

"Not well formed" is the list of decision 1, applied to `POST /exits`: missing or empty body, body
that is not valid JSON, `Content-Type` missing or not `application/json` (400, not 415), body that
is not a JSON object, `plate` missing or not a JSON string, any field other than `plate` (for example
`exitedAt` or `enteredAt`), a path that cannot be decoded, an invalid `Content-Length`, and any other
framework rejection of the request itself. The 1 MiB limit, the 500 rule with no internal details,
and the section "Scope of the error rules" of decision 1 apply to `POST /exits` unchanged.

The checks run in the order of decision 1, with "not inside" as the last one: valid `Content-Length`
and path that can be decoded, then known route and method, then body size, then the rest of the
well-formed request, then valid plate, then the vehicle is inside. A request that fails a check gets
that check's error and closes no stay.

The API now has three routes: `POST /entries`, `POST /exits` and `GET /health` (with `HEAD /health`
as in decision 1). This list replaces the list of two routes in decision 1; every other rule there
about unknown routes and methods stays. `GET /exits`, `HEAD /exits` or `POST /exit`, for example, get
`404 {"error": "not_found"}` and close no stay.

Reason: the exit is the mirror of the entry, a booth action on a plate, so it takes the same request
shape and the same error rules; the booth's software handles both routes in one way. The response
repeats the plate and both times so the staff can show the driver what is charged and why. Money as
integer cents follows the architecture and keeps the amount exact in JSON; the unit is in the field
name so the booth cannot read `500` as 500 €. A vehicle that is not inside is a conflict with the
current state, the same kind of fault as "already inside" on entry, so it gets `409` with a code of
its own; `404` stays reserved for something the API does not have, so the booth never has to tell a
missing route from a missing vehicle by the code alone. `200` and not `201`: the exit creates no
resource the booth can fetch later.

## Exit time

The server takes the exit time from the injected clock at the moment of the exit, truncated to the
second, as the entry time in decision 1: a clock reading `10:30:00.900` gives `10:30:00`. The booth
cannot send it.

Reason: the fee depends on it, and whole seconds on both ends make the duration a whole number of
seconds, the same in the response, the calculation and a manual check.

## Fee at the day rate

The stay lasts from the recorded entry instant to the exit instant, measured as real elapsed time in
whole seconds; a daylight saving change does not add or remove an hour from it.

- A stay of 30 minutes (1,800 seconds) or less is free: `0`.
- After the first 30 minutes, the stay is charged in blocks of 60 minutes starting at minute 30. A
  block that has started counts whole, even after one second.
- In this issue every block costs the day rate, 250 cents, whatever the hour it starts in.

So `feeCents = 250 × ceil((seconds − 1800) / 3600)` when the stay is longer than 1,800 seconds, and
`0` otherwise. Examples: 30 min 00 s → `0`; 30 min 01 s → `250`; 1 h 30 min 00 s → `250`;
1 h 30 min 01 s → `500`; 2 h 15 min → `500`; 7 h → `1750`.

An exit instant earlier than the entry instant, which only a server clock moved backwards can
produce, counts as a stay of 0 seconds: the fee is `0` and the exit is registered.

The fee is calculated in the domain layer, from the two instants, with no access to the clock or the
database; issues #3 (night rate), #4 (daily cap) and #5 (lost ticket) extend that calculation.

Reason: this is the fee rule of `ARCHITECTURE.md` restricted to the day band, which is what the issue
asks for. Real elapsed time is what the driver actually stayed; counting wall-clock time would charge
an hour that never passed in October, or skip one in March. The band of each block is out of scope
here, so a block that starts at night still pays the day rate until #3 is delivered. A clock moved
backwards is a server fault the booth cannot fix, and the vehicle must still be able to leave;
charging nothing is the only fee that never overcharges.

## Data model

No new table or column. The exit removes the vehicle's row from `parked_vehicles`; the fee is
calculated from the `entered_at` of the removed row. The fee and the exit are not stored: payments
and history are out of scope.

- Removing the row is what closes the stay. The exit answers `200` with the fee only when its request
  removed the row; if the removal fails, the answer is `500 internal_error` and the row stays as it
  was, so the vehicle is still inside.
- The read of `entered_at` and the removal are one atomic step: of two simultaneous exits of the
  same plate, exactly one gets `200` and the fee, and the other gets `409 vehicle_not_inside`.
- Once the row is removed, the same plate can enter again through `POST /entries`.

Reason: decision 1 set the table as the current state "inside the car park" and announced that the
exit removes the row. Making the removal the point that closes the stay keeps the booth from charging
a vehicle that stays recorded as inside, or charging the same stay twice.
