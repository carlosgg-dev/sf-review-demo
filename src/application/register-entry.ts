import { normalisePlate } from "../domain/plate.ts";
import { type Clock, currentSecond, inCarParkTime } from "./car-park-time.ts";

export { InvalidPlate } from "../domain/plate.ts";

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
    const enteredAt = currentSecond(this.#clock);
    this.#vehicles.add({ plate, enteredAt });
    return { plate, enteredAt: inCarParkTime(enteredAt) };
  }
}
