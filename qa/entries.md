# QA: vehicle entries

## Preparation

1. Start the server on an empty database:
   `DATABASE_PATH=data/qa-entries.db node --env-file-if-exists=.env src/main.ts` after deleting
   `data/qa-entries.db` if it exists.
   Expected: the console shows `Listening on http://127.0.0.1:3000`.

## Register an entry

2. `curl -i -X POST http://127.0.0.1:3000/entries -H 'Content-Type: application/json' -d '{"plate":"TEST001"}'`
   Expected: `201 Created` and a body
   `{"plate":"TEST001","enteredAt":"<now>"}`, where `<now>` is the current time in Madrid, to the
   second, with its offset (`+01:00` in winter, `+02:00` in summer), for example
   `2026-11-13T09:15:00+01:00`.
3. `curl -i -X POST http://127.0.0.1:3000/entries -H 'Content-Type: application/json' -d '{"plate":"test-002"}'`
   Expected: `201 Created` and `"plate":"TEST002"` in the body.

## A vehicle already inside

4. Repeat step 2 with `{"plate":"test 001"}`.
   Expected: `409 Conflict` and the body `{"error":"vehicle_already_inside"}`.

## A plate that is not valid

5. Repeat step 2 with `{"plate":"12#4"}`, then with `{"plate":"A"}` and with `{"plate":"ÑAB123"}`.
   Expected: each one `400 Bad Request` and the body `{"error":"invalid_plate"}`.

## A request that is not well formed

6. Repeat step 2 with the body `{"plate":"TEST003","enteredAt":"2026-01-01T00:00:00+01:00"}`.
   Expected: `400 Bad Request` and the body `{"error":"invalid_request"}`.
7. Repeat step 2 with the body `{"plate":1234}`.
   Expected: `400 Bad Request` and the body `{"error":"invalid_request"}`.
8. Repeat step 2 with the body `{"plate":` (malformed JSON).
   Expected: `400 Bad Request` and the body `{"error":"invalid_request"}`.
9. Repeat step 2 replacing the header with `-H 'Content-Type: text/plain'`.
   Expected: `400 Bad Request` (not `415`) and the body `{"error":"invalid_request"}`.
10. Repeat step 2 with `{"plate":"TEST003"}`, then with `{"plate":"1234"}`.
    Expected: `201 Created` both times, which shows that steps 6 to 8 recorded nothing.

## The entry survives a restart

11. Stop the server, start it again as in step 1 without deleting the database, and repeat step 2.
    Expected: `409 Conflict` and the body `{"error":"vehicle_already_inside"}`.
