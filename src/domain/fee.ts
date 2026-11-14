const FREE_SECONDS = 30 * 60;
const BLOCK_SECONDS = 60 * 60;
const DAY_RATE_CENTS = 250;

/**
 * Real elapsed time, so a daylight saving change neither adds nor removes an hour. An exit earlier
 * than the entry, from a clock moved backwards, gives a negative count of blocks and so no charge.
 */
export function feeCents(enteredAt: Temporal.Instant, exitedAt: Temporal.Instant): number {
  const seconds = enteredAt.until(exitedAt).total("seconds");
  const blocks = Math.max(0, Math.ceil((seconds - FREE_SECONDS) / BLOCK_SECONDS));
  return blocks * DAY_RATE_CENTS;
}
