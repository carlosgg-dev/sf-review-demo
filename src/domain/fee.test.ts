import { describe, expect, it } from "vitest";
import { feeCents } from "./fee.ts";

const ENTRY = Temporal.Instant.from("2026-11-13T08:00:00Z");

const after = (seconds: number) => ENTRY.add({ seconds });

describe("feeCents", () => {
  it.each([
    ["leaves at once", 0, 0],
    ["exactly 30 minutes", 1800, 0],
    ["one second over 30 minutes", 1801, 250],
    ["exactly one block", 5400, 250],
    ["one second into the second block", 5401, 500],
    ["two hours and a quarter", 8100, 500],
    ["seven hours", 25200, 1750],
  ])("charges %s", (_case, seconds, fee) => {
    expect(feeCents(ENTRY, after(seconds))).toBe(fee);
  });

  it("charges nothing when the exit is earlier than the entry", () => {
    expect(feeCents(ENTRY, after(-3600))).toBe(0);
  });

  it("counts the time that really passed across a daylight saving change", () => {
    const enteredAt = Temporal.Instant.from("2026-10-25T01:00:00+02:00");
    const exitedAt = Temporal.Instant.from("2026-10-25T02:00:00+01:00");

    expect(feeCents(enteredAt, exitedAt)).toBe(500);
  });
});
