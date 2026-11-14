import { feeCents } from "../domain/fee.ts";
import { normalisePlate } from "../domain/plate.ts";
import { type Clock, currentSecond, inCarParkTime } from "./car-park-time.ts";
import type { ParkedVehicle } from "./register-entry.ts";

export { InvalidPlate } from "../domain/plate.ts";

export interface LeavingVehicles {
  /**
   * Reads and removes the vehicle in one atomic step, so a stay is closed and charged only once.
   * Throws VehicleNotInside when the plate is not inside.
   */
  remove(plate: string): ParkedVehicle;
}

export class VehicleNotInside extends Error {}

export interface Exit {
  readonly plate: string;
  readonly enteredAt: Temporal.ZonedDateTime;
  readonly exitedAt: Temporal.ZonedDateTime;
  readonly feeCents: number;
}

export class CheckOut {
  readonly #clock: Clock;
  readonly #vehicles: LeavingVehicles;

  constructor(clock: Clock, vehicles: LeavingVehicles) {
    this.#clock = clock;
    this.#vehicles = vehicles;
  }

  /** Throws InvalidPlate or VehicleNotInside. */
  leave(typedPlate: string): Exit {
    const plate = normalisePlate(typedPlate);
    const exitedAt = currentSecond(this.#clock);
    const { enteredAt } = this.#vehicles.remove(plate);
    return {
      plate,
      enteredAt: inCarParkTime(enteredAt),
      exitedAt: inCarParkTime(exitedAt),
      feeCents: feeCents(enteredAt, exitedAt),
    };
  }
}
