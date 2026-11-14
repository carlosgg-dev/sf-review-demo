const CAR_PARK_TIME_ZONE = "Europe/Madrid";

export interface Clock {
  now(): Temporal.Instant;
}

/** Whole seconds on both ends of a stay make its duration a whole number of seconds. */
export function currentSecond(clock: Clock): Temporal.Instant {
  return clock.now().round({ smallestUnit: "second", roundingMode: "floor" });
}

export function inCarParkTime(instant: Temporal.Instant): Temporal.ZonedDateTime {
  return instant.toZonedDateTimeISO(CAR_PARK_TIME_ZONE);
}
