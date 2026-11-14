# QA: vehicle exits

Run this procedure between 10:00 and 22:00 Madrid time, so every stay below lies within the day
band. Steps 5 and 7 move an entry time back in the database to simulate a long stay; the seconds
taken between that command and the next one only add a few seconds to the stay.

## Preparation

1. Start the server on an empty database:
   `DATABASE_PATH=data/qa-exits.db node --env-file-if-exists=.env src/main.ts` after deleting
   `data/qa-exits.db` if it exists.
   Expected: the console shows `Listening on http://127.0.0.1:3000`.

## A vehicle leaves

2. `curl -i -X POST http://127.0.0.1:3000/entries -H 'Content-Type: application/json' -d '{"plate":"TEST001"}'`
   Expected: `201 Created`; note the `enteredAt` of the body.
3. `curl -i -X POST http://127.0.0.1:3000/exits -H 'Content-Type: application/json' -d '{"plate":"TEST001"}'`
   Expected: `200 OK` and a body
   `{"plate":"TEST001","enteredAt":"<step 2>","exitedAt":"<now>","feeCents":0}`, where `<step 2>` is
   the `enteredAt` noted in step 2 and `<now>` is the current time in Madrid, to the second, with its
   offset (`+01:00` in winter, `+02:00` in summer).
4. Repeat step 3.
   Expected: `409 Conflict` and the body `{"error":"vehicle_not_inside"}`.

## The fee of a longer stay

5. Register `TEST002` as in step 2, then move its entry 2 hours and 15 minutes back:
   `sqlite3 data/qa-exits.db "UPDATE parked_vehicles SET entered_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-135 minutes') WHERE plate = 'TEST002'"`
6. `curl -i -X POST http://127.0.0.1:3000/exits -H 'Content-Type: application/json' -d '{"plate":"test-002"}'`
   Expected: `200 OK`, `"plate":"TEST002"`, an `enteredAt` 2 hours and 15 minutes before `exitedAt`,
   and `"feeCents":500` (5.00 €).
7. Register `TEST003` and `TEST004` as in step 2, then move `TEST003` 29 minutes back and `TEST004`
   31 minutes back with the command of step 5, using `'-29 minutes'` and `'-31 minutes'`. Then send
   the exit of `TEST003` and of `TEST004` as in step 3.
   Expected: `200 OK` both times, with `"feeCents":0` for `TEST003` and `"feeCents":250` for
   `TEST004`.
8. `sqlite3 data/qa-exits.db "SELECT count(*) FROM parked_vehicles"`
   Expected: `0`; every stay of steps 3 to 7 is closed.
9. Register `TEST002` again as in step 2.
   Expected: `201 Created`; a vehicle that has left can enter again.

## A request that is not valid

10. Repeat step 3 with `{"plate":"12#4"}`.
    Expected: `400 Bad Request` and the body `{"error":"invalid_plate"}`.
11. Repeat step 3 with the body `{"plate":"TEST002","exitedAt":"2026-11-13T09:10:00+01:00"}`, then
    with `{"plate":1234}`, then with the header `-H 'Content-Type: text/plain'` and the body
    `{"plate":"TEST002"}`.
    Expected: `400 Bad Request` (not `415`) and the body `{"error":"invalid_request"}` all three
    times.
12. `curl -i http://127.0.0.1:3000/exits`, then
    `curl -i -X POST http://127.0.0.1:3000/exit -H 'Content-Type: application/json' -d '{"plate":"TEST002"}'`.
    Expected: `404 Not Found` and the body `{"error":"not_found"}` both times.
13. `sqlite3 data/qa-exits.db "SELECT plate FROM parked_vehicles"`
    Expected: one row, `TEST002`; steps 10 to 12 closed no stay.

## An unexpected failure

14. Stop the server, run `chmod 444 data/qa-exits.db`, start the server again as in step 1 without
    deleting the database, and repeat step 3 with `{"plate":"TEST002"}`.
    Expected: `500 Internal Server Error` and exactly the body `{"error":"internal_error"}`, with no
    message, error code, SQL or path such as `readonly` or `qa-exits.db`.
15. Stop the server, run `chmod 644 data/qa-exits.db`, then repeat step 13.
    Expected: one row, `TEST002`; the failed exit left the vehicle inside.
