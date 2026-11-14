import { describe, expect, it } from "vitest";
import { CheckOut, InvalidPlate, VehicleNotInside } from "./check-out.ts";
import type { ParkedVehicle } from "./register-entry.ts";

function checkOutAt(now: string, inside: ParkedVehicle[] = []) {
  const clock = { now: () => Temporal.Instant.from(now) };
  const vehicles = {
    remove(plate: string) {
      const index = inside.findIndex((vehicle) => vehicle.plate === plate);
      if (index === -1) {
        throw new VehicleNotInside();
      }
      return inside.splice(index, 1)[0] as ParkedVehicle;
    },
  };
  return { checkOut: new CheckOut(clock, vehicles), inside };
}

const parked = (plate: string, enteredAt: string) => ({
  plate,
  enteredAt: Temporal.Instant.from(enteredAt),
});

describe("CheckOut", () => {
  it("closes the stay of the normalised plate and returns both times in Madrid and the fee", () => {
    const { checkOut, inside } = checkOutAt("2026-11-13T10:15:00Z", [
      parked("1234ABC", "2026-11-13T08:00:00Z"),
    ]);

    const exit = checkOut.checkOut("1234-abc");

    expect(exit.plate).toBe("1234ABC");
    expect(exit.enteredAt.toString()).toBe("2026-11-13T09:00:00+01:00[Europe/Madrid]");
    expect(exit.exitedAt.toString()).toBe("2026-11-13T11:15:00+01:00[Europe/Madrid]");
    expect(exit.feeCents).toBe(500);
    expect(inside).toEqual([]);
  });

  it("drops the fraction of a second of the exit time before charging", () => {
    const { checkOut } = checkOutAt("2026-11-13T09:30:00.900Z", [
      parked("1234ABC", "2026-11-13T08:00:00Z"),
    ]);

    const exit = checkOut.checkOut("1234ABC");

    expect(exit.exitedAt.toString()).toBe("2026-11-13T10:30:00+01:00[Europe/Madrid]");
    expect(exit.feeCents).toBe(250);
  });

  it("rejects a plate that is not valid and closes no stay", () => {
    const first = parked("1234ABC", "2026-11-13T08:00:00Z");
    const { checkOut, inside } = checkOutAt("2026-11-13T09:00:00Z", [first]);

    expect(() => checkOut.checkOut("12#4")).toThrow(InvalidPlate);
    expect(inside).toEqual([first]);
  });

  it("rejects a vehicle that is not inside", () => {
    const { checkOut } = checkOutAt("2026-11-13T09:00:00Z");

    expect(() => checkOut.checkOut("1234ABC")).toThrow(VehicleNotInside);
  });
});
