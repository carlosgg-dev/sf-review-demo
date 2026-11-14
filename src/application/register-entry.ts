import { normalisePlate } from "../domain/plate.ts";

export { InvalidPlate } from "../domain/plate.ts";

const CAR_PARK_TIME_ZONE = "Europe/Madrid";

export interface Clock {
  now(): Temporal.Instant;
}

export interface ParkedVehicle {
  readonly plate: string;
  readonly enteredAt: Temporal.Instant;
}

export interface ParkedVehicles {
  /** Throws VehicleAlreadyInside, keeping the existing entry, when the plate is already inside. */
  add(vehicle: ParkedVehicle): void;
}

export class VehicleAlreadyInside extends Error {}

export interface Entry {
  readonly plate: string;
  readonly enteredAt: Temporal.ZonedDateTime;
}

export class RegisterEntry {
  readonly #clock: Clock;
  readonly #vehicles: ParkedVehicles;

  constructor(clock: Clock, vehicles: ParkedVehicles) {
    this.#clock = clock;
    this.#vehicles = vehicles;
  }

  /** Throws InvalidPlate or VehicleAlreadyInside. */
  register(typedPlate: string): Entry {
    const plate = normalisePlate(typedPlate);
    const enteredAt = this.#clock.now().round({ smallestUnit: "second", roundingMode: "floor" });
    this.#vehicles.add({ plate, enteredAt });
    return { plate, enteredAt: enteredAt.toZonedDateTimeISO(CAR_PARK_TIME_ZONE) };
  }
}
