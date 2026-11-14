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

4. Wait at least one minute after step 2, then repeat step 2 with `{"plate":"test 001"}`.
   Expected: `409 Conflict` and the body `{"error":"vehicle_already_inside"}`.
5. `sqlite3 data/qa-entries.db "SELECT plate, entered_at FROM parked_vehicles WHERE plate = 'TEST001'"`
   Expected: one row, `TEST001|<UTC time of step 2>`, the `enteredAt` of step 2 converted to UTC,
   for example `2026-11-13T08:15:00Z`; not the time of step 4.

## A plate that is not valid

6. Repeat step 2 with `{"plate":"12#4"}`, then with `{"plate":"A"}`, `{"plate":"ÑAB123"}`,
   `{"plate":"1234\tABC"}` (tab), `{"plate":"1234\u00a0ABC"}` (non-breaking space) and
   `{"plate":"1234\u2013ABC"}` (en dash), typed exactly so; the JSON escapes produce the characters.
   Expected: each one `400 Bad Request` and the body `{"error":"invalid_plate"}`.

## A request that is not well formed

7. Repeat step 2 with the body `{"plate":"TEST003","enteredAt":"2026-01-01T00:00:00+01:00"}`.
   Expected: `400 Bad Request` and the body `{"error":"invalid_request"}`.
8. Repeat step 2 with the body `{"plate":1234}`.
   Expected: `400 Bad Request` and the body `{"error":"invalid_request"}`.
9. Repeat step 2 with the body `{"plate":` (malformed JSON).
   Expected: `400 Bad Request` and the body `{"error":"invalid_request"}`.
10. Repeat step 2 replacing the header with `-H 'Content-Type: text/plain'`.
    Expected: `400 Bad Request` (not `415`) and the body `{"error":"invalid_request"}`.
11. Repeat step 2 with a valid plate followed by more than 1 MiB of spaces, which are valid JSON
    whitespace:
    `{ printf '{"plate":"TEST008"}'; head -c 1100000 /dev/zero | tr '\0' ' '; } | curl -i -X POST http://127.0.0.1:3000/entries -H 'Content-Type: application/json' --data-binary @-`
    Expected: `413 Payload Too Large` and the body `{"error":"invalid_request"}`.
12. Repeat step 2 with `{"plate":"TEST003"}`, then with `{"plate":"1234"}`, then with
    `{"plate":"TEST008"}`.
    Expected: `201 Created` all three times, which shows that steps 7 to 9 and 11 recorded nothing.

## Accepted variants of a request

13. Repeat step 2 replacing the header with
    `-H 'Content-Type: application/json; charset=iso-8859-1'` and the body `{"plate":"TEST004"}`.
    Expected: `201 Created` and `"plate":"TEST004"` in the body.
14. Send the plate `ÑAB123` encoded in ISO-8859-1, where `Ñ` is the single byte `0xD1`, which is not
    valid UTF-8:
    `printf '{"plate":"\321AB123"}' | curl -i -X POST http://127.0.0.1:3000/entries -H 'Content-Type: application/json; charset=iso-8859-1' --data-binary @-`
    Expected: `400 Bad Request` and the body `{"error":"invalid_plate"}`.
15. Repeat step 2 with the body `{"plate":"TEST005","plate":"TEST006"}`.
    Expected: `201 Created` and `"plate":"TEST006"` in the body; repeating step 2 with
    `{"plate":"TEST005"}` then gives `201 Created`, which shows that only `TEST006` was recorded.

## An unknown route or method

16. `curl -i http://127.0.0.1:3000/entries`, then
    `curl -i -X POST http://127.0.0.1:3000/entry -H 'Content-Type: application/json' -d '{"plate":"TEST009"}'`.
    Expected: `404 Not Found` and the body `{"error":"not_found"}` both times; repeating step 2
    with `{"plate":"TEST009"}` then gives `201 Created`, which shows that nothing was recorded.

## The entry survives a restart

17. Stop the server, start it again as in step 1 without deleting the database, and repeat step 2.
    Expected: `409 Conflict` and the body `{"error":"vehicle_already_inside"}`.

## An unexpected failure

18. Stop the server, run `chmod 444 data/qa-entries.db`, start the server again as in step 1
    without deleting the database, and repeat step 2 with `{"plate":"TEST007"}`.
    Expected: `500 Internal Server Error` and exactly the body `{"error":"internal_error"}`, with no
    message, error code, SQL or path such as `readonly` or `qa-entries.db`.
19. Stop the server and run `chmod 644 data/qa-entries.db`.
    Expected: the file is writable again.
