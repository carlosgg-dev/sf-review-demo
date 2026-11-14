import { describe, expect, it } from "vitest";
import {
  InvalidPlate,
  type ParkedVehicle,
  RegisterEntry,
  VehicleAlreadyInside,
} from "./register-entry.ts";

function registerEntryAt(now: string, inside: ParkedVehicle[] = []) {
  const clock = { now: () => Temporal.Instant.from(now) };
  const vehicles = {
    add(vehicle: ParkedVehicle) {
      if (inside.some(({ plate }) => plate === vehicle.plate)) {
        throw new VehicleAlreadyInside();
      }
      inside.push(vehicle);
    },
  };
  return { registerEntry: new RegisterEntry(clock, vehicles), inside };
}

describe("RegisterEntry", () => {
  it("records the normalised plate at the clock time and returns it in Madrid time", () => {
    const { registerEntry, inside } = registerEntryAt("2026-11-13T08:15:00Z");

    const entry = registerEntry.register("1234-abc");

    expect(entry.plate).toBe("1234ABC");
    expect(entry.enteredAt.toString()).toBe("2026-11-13T09:15:00+01:00[Europe/Madrid]");
    expect(inside).toEqual([
      { plate: "1234ABC", enteredAt: Temporal.Instant.from("2026-11-13T08:15:00Z") },
    ]);
  });

  it("uses the summer offset of Madrid in summer", () => {
    const { registerEntry } = registerEntryAt("2026-07-01T07:15:00Z");

    expect(registerEntry.register("1234ABC").enteredAt.toString()).toBe(
      "2026-07-01T09:15:00+02:00[Europe/Madrid]",
    );
  });

  it("drops the fraction of a second without rounding up", () => {
    const { registerEntry, inside } = registerEntryAt("2026-11-13T08:15:00.750Z");

    const entry = registerEntry.register("1234ABC");

    expect(entry.enteredAt.toString()).toBe("2026-11-13T09:15:00+01:00[Europe/Madrid]");
    expect(inside[0]?.enteredAt.toString()).toBe("2026-11-13T08:15:00Z");
  });

  it("rejects a plate that is not valid and records nothing", () => {
    const { registerEntry, inside } = registerEntryAt("2026-11-13T08:15:00Z");

    expect(() => registerEntry.register("12#4")).toThrow(InvalidPlate);
    expect(inside).toEqual([]);
  });

  it("rejects a vehicle already inside and keeps its entry", () => {
    const first = { plate: "1234ABC", enteredAt: Temporal.Instant.from("2026-11-13T08:15:00Z") };
    const { registerEntry, inside } = registerEntryAt("2026-11-13T09:40:00Z", [first]);

    expect(() => registerEntry.register("1234 abc")).toThrow(VehicleAlreadyInside);
    expect(inside).toEqual([first]);
  });
});
