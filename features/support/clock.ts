/** Reads a wall-clock time of the scenarios, such as "2026-11-13 09:00:00", in Madrid. */
export function madridClock(clock: string): Temporal.Instant {
  return Temporal.PlainDateTime.from(clock.replace(" ", "T"))
    .toZonedDateTime("Europe/Madrid")
    .toInstant();
}
