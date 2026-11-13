# Architecture

## Product

An HTTP API for the staff at the car park exit booth. It registers each vehicle's entry (licence
plate and server time) and, when the vehicle leaves, calculates the fee it must pay.

Fee rules: the first 30 minutes are free; after that, charging runs in 60-minute blocks starting at
minute 30, any fraction counting as a whole block. Each block pays the rate of the band it starts
in: 2.50 € per hour from 07:00 to 22:00, 1 € per hour from 22:00 to 07:00. Each calendar day is
capped at 20 €, and a block counts towards the day it starts in. A lost ticket pays a fixed 30 €.
All times are in Europe/Madrid, daylight saving changes included.

Out of scope: payments, subscribers, multiple floors, reservations, users and login, a web
interface, and occupancy or history queries.

## Stack

- TypeScript run directly by Node 26 (native type stripping), no build step.
- Fastify 5 for HTTP, with input validated by JSON Schema at the route.
- `Temporal` for dates and time zones.
- SQLite through `node:sqlite`, in a file; in memory for tests.
- Money as integer cents.

## Structure

```
src/
  domain/        fee calculation and licence plates; pure, depends on nothing
  application/   use cases: register entry, check out; receive a clock and a repository
  persistence/   SQLite repositories
  http/          Fastify routes; translate HTTP to use cases
  config.ts      environment configuration, validated at start-up
  main.ts        composition root
features/        acceptance scenarios (Cucumber)
```

Allowed dependencies: `http` → `application` → `domain`; `persistence` → `application`, `domain`.
`domain` imports nothing from the other layers. Only `main.ts` wires concrete classes together.

## Decisions

- **Layered, not hexagonal**: a small service with rich fee rules; clear layer boundaries keep the
  domain testable without the cost of full ports and adapters.
- **Server time, injected clock**: the booth cannot set entry or exit times; tests inject a fixed
  clock.
- **Vehicles are identified by normalised plate** (upper case, no spaces or hyphens); a plate
  already inside cannot enter again.
- **Acceptance tests**: user flows go through the HTTP API (`inject`, fixed clock, in-memory
  SQLite); fee rules are checked against the check-out use case, below the interface.
