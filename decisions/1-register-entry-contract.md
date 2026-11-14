# Issue 1: register a vehicle entry

## API contract

`POST /entries` with `Content-Type: application/json` and the JSON body
`{"plate": "<licence plate>"}`. Parameters of the content type are allowed and do not change how the
body is read: any `charset`, for example `charset=utf-8` or `charset=iso-8859-1`, is accepted, and
the body is always read as UTF-8. A byte sequence that is not valid UTF-8 is read as the replacement
character U+FFFD and then handled like any other character: inside the value of `plate` it makes the
plate `invalid_plate`; anywhere else it makes the request not well formed, `invalid_request`. For
example, with `charset=iso-8859-1`, the body `{"plate":"<byte 0xD1>AB123"}`, which is `ÑAB123` in
ISO-8859-1, is `400 invalid_plate`, the same answer as `ÑAB123` sent in UTF-8.

One UTF-8 byte order mark (the bytes `EF BB BF`) as the very first bytes of the body is ignored, and
the rest of the body is read as if it were not there: `<BOM>{"plate":"TEST003"}` registers
`TEST003`. Anywhere else the byte order mark is the character U+FEFF and is handled like any other
character: inside the value of `plate` it makes the plate `invalid_plate`; anywhere else, for
example after a first byte order mark, after whitespace or after the JSON value, it makes the
request `invalid_request`. A body that holds only a byte order mark is empty, so it is
`invalid_request`.

| Case                                          | Status | Body                                                             |
| --------------------------------------------- | ------ | ---------------------------------------------------------------- |
| Entry registered                              | 201    | `{"plate": "1234ABC", "enteredAt": "2026-11-13T09:15:00+01:00"}` |
| The normalised plate is already inside        | 409    | `{"error": "vehicle_already_inside"}`                            |
| `plate` is a string that is not a valid plate | 400    | `{"error": "invalid_plate"}`                                     |
| The request is not well formed (list below)   | 400    | `{"error": "invalid_request"}`                                   |
| The body is larger than 1 MiB                 | 413    | `{"error": "invalid_request"}`                                   |
| Unknown route or method                       | 404    | `{"error": "not_found"}`                                         |
| Unexpected failure of the server              | 500    | `{"error": "internal_error"}`                                    |

A request is not well formed, and gets `400 invalid_request`, when any of these holds:

- the body is missing or empty;
- the body is not valid JSON, for example `{"plate":`;
- the `Content-Type` is missing or is not `application/json`, for example `text/plain`; this is
  400 `invalid_request`, not 415;
- the body is not a JSON object, for example `["1234ABC"]` or `null`;
- `plate` is missing or is not a JSON string, for example `{"plate": 1234}` or `{"plate": null}`;
  values of another type are never converted to a string;
- the body has any field other than `plate`, for example `enteredAt`; extra fields are never
  silently dropped;
- the path of the URL cannot be decoded: it has a percent escape that is malformed, for example
  `/%zz` or `/health%`, or whose bytes are not valid UTF-8, for example `GET /%c0` or
  `POST /entries%c0`; this holds on any path and with any method, and the answer never repeats the
  URL;
- the `Content-Length` header is invalid: its value is empty or is not made only of the digits
  `0`-`9`, for example `abc`, `-5`, `+5` or `0x10`; or it is larger than 18446744073709551615
  (2^64 - 1), the largest length the HTTP parser of Node can hold, for example
  `99999999999999999999`; or the request has more than one `Content-Length` header. Any value up to
  that limit is valid, however large, and the other rules decide the answer: a `Content-Length` of
  `2000000` with a body of that size is `413` on `POST /entries` and `404` on `POST /entry`;
- the framework rejects the request for any other fault of the request itself, except a body that
  is too large and an unknown route or method (below).

The query string of the URL is not read by any route and never changes the answer, even when it
cannot be decoded: `POST /entries?a=%c0` with a valid body registers the entry.

A body that repeats the `plate` key is well formed: the last value is the one used. For example
`{"plate": "TEST005", "plate": "TEST006"}` registers `TEST006`, and
`{"plate": "TEST005", "plate": "12#4"}` is `invalid_plate`.

A body larger than 1 MiB (1,048,576 bytes) gets `413` with the body `{"error": "invalid_request"}`
and records nothing; the check runs right after the route check and before every check on the
content of the body.

An unexpected failure is any failure that is not one of the cases above, for example a database
that is locked, read only or on a full disk. It gets `500` with exactly the body
`{"error": "internal_error"}`: no message, error code, stack trace, SQL or file path of the server.
This holds for every route of the API, `GET /health` included: a health check whose database does
not answer gets the same `500` and the same body.

The API has two routes: `POST /entries` and `GET /health`; `HEAD /health` answers like
`GET /health` without a body, as HTTP requires of every `GET` route. Any other path, for example
`POST /entry`, and any other method on these paths, for example `GET /entries` or `POST /health`,
gets `404` with the body `{"error": "not_found"}` and records nothing; it is neither
`400 invalid_request` nor `405`. Only a URL whose path cannot be decoded is checked before the
route: `GET /%c0` is `400 invalid_request`, not `404`, because without a decoded path there is no
route to look for. The route check runs next, before the size and every other check on the body:
`POST /entry` with a body larger than 1 MiB, with `Content-Type: text/plain` or with the body
`{"plate":` gets `404 not_found`, not `413` or `400`.

Further rules:

- The checks run in this order: valid `Content-Length` and path that can be decoded, then known
  route and method, then body size, then the rest of the well-formed request, then valid plate, then
  already inside. A request that fails a check gets that check's error and records nothing; an
  unexpected failure at any point gets `500 internal_error`.
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

Every error response of the API, within the scope set below, has the same `{"error": "<code>"}`
shape, so the booth never has to parse a second format. A framework rejection of the request is a
fault of the booth's software like the listed ones, so it shares their code; a body that is too
large keeps the standard 413 status, which tells it apart without a new code. 1 MiB is the
framework's default limit and is far above any valid request. Internal details in a 500 would expose
the server's database and files to the client and are of no use to the booth, which can only retry
or call for help. Reading the body always as UTF-8 follows RFC 8259, which requires UTF-8 for JSON
exchanged between systems; a plate is ASCII, so the charset makes no difference to a valid plate.
Reading bytes that are not UTF-8 as U+FFFD, instead of rejecting the whole body, keeps one rule for
every plate the booth cannot send: a character outside ASCII, however it was encoded, is a plate
mistake the staff can correct. The last value of a repeated key is how standard JSON parsers read
it; rejecting it would need a parser of its own for a case the booth does not send. An unknown route
or method is not a fault in a request to this API but a request to something the API does not have,
so it keeps the standard 404 of HTTP and gets a code of its own in the same shape; 404 for a wrong
method on a known path, rather than 405, spares the booth a case that calls for the same action,
fixing its software. The route is checked before the body because the rules on the body belong to
`POST /entries`: a request to something the API does not have has no body rules to break, and the
size and form of its body never decide its answer.

## Scope of the error rules

The error rules above are closed by this boundary.

Guaranteed: the status and the `{"error": "<code>"}` body set above for every request that the HTTP
server of Node passes to the framework (Fastify), whatever its route, method, headers or body, a URL
whose path cannot be decoded included; and for every request with an invalid `Content-Length`, as
defined above, that has no `Transfer-Encoding` header. A response to a `HEAD` request never has a
body: it gets the status of its error only, for example `HEAD /entries` gets `404` and
`HEAD /%c0` gets `400`.

Out of scope, with no status, body or time of answer promised; the connection may be closed without
an answer:

- a `Content-Length` larger than the bytes actually sent: the server waits for the rest of the body
  until its own timeout ends the connection;
- everything else that the HTTP layer of Node, its parser or its server, answers or closes by itself
  before the framework sees the request. For example a malformed request line, an invalid header,
  headers larger than the parser's limit, a request with both `Transfer-Encoding` and
  `Content-Length` whatever the value of `Content-Length`, a malformed chunked body, an HTTP/1.1
  request without a `Host` header, or an `Expect` header other than `100-continue`.

Reason: the booth talks to the API through a standard HTTP client, which sends requests that the
parser of Node accepts. Every request that reaches the framework is one the API can answer in its
own shape, so the rule holds there without exception. An invalid `Content-Length` is the one parser
error the contract already named as a fault of the booth's software, so it keeps that answer. A
`Content-Length` larger than the body cannot be told apart from a slow client until the timeout, and
a standard client never sends it. The other parser errors are not requests a standard client sends,
and answering each in the API's shape would mean taking over the parser's error handling for cases
in which the booth has nothing different to do; leaving them out closes the error rules instead of
promising a shape for every malformed byte stream. The same holds for the answers the HTTP server of
Node gives by itself, such as a missing `Host` or an unknown expectation, and for a request with both
`Transfer-Encoding` and `Content-Length`: their conflict makes it a malformed byte stream whatever
the value of `Content-Length`, so that rule wins over the one on an invalid `Content-Length`. HTTP
forbids a body in the response to `HEAD`, so a `HEAD` request learns its error from the status. A path that cannot be decoded is a fault of the
booth's request, not a request for something the API lacks, so it is `400 invalid_request` and not
`404`; the answer never repeats the URL because no error body carries input or internal details. A
byte order mark before the JSON is accepted because RFC 8259 allows a parser to ignore it and some
clients add it; it carries no data, so rejecting it would turn a harmless encoding habit into a
failed entry.

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
`1234\tABC` (with a tab), `1234\u00A0ABC` (with a non-breaking space), `1234\u2013ABC` (with an
en dash), `1234ıbc`, `ÑAB123`, `A`, `1-` and `ABCDE123456` are `invalid_plate`.

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

A registration of a plate already in the table fails and leaves the existing row unchanged: the
original `entered_at` is kept, never overwritten by the time of the rejected registration. The
duplicate check relies on the primary key, not on a previous read, so two simultaneous entries of
the same plate cannot both succeed. The table is created at start-up when it does not exist.

Reason: the table models the current state "inside the car park", which is all this issue and the
check-out need; check-out will remove the row. History is out of scope. Storing UTC instants avoids
ambiguous local times at daylight saving changes; the conversion to Europe/Madrid happens on output
and in the fee calculation.
