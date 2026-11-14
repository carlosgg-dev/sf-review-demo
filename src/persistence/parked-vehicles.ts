import type { DatabaseSync, StatementSync } from "node:sqlite";
import { type LeavingVehicles, VehicleNotInside } from "../application/check-out.ts";
import {
  type ParkedVehicle,
  type ParkedVehicles,
  VehicleAlreadyInside,
} from "../application/register-entry.ts";

const SQLITE_CONSTRAINT_PRIMARYKEY = 1555;

export class SqliteParkedVehicles implements ParkedVehicles, LeavingVehicles {
  readonly #insert: StatementSync;
  readonly #delete: StatementSync;

  constructor(connection: DatabaseSync) {
    connection.exec(
      "CREATE TABLE IF NOT EXISTS parked_vehicles (plate TEXT PRIMARY KEY, entered_at TEXT NOT NULL)",
    );
    this.#insert = connection.prepare(
      "INSERT INTO parked_vehicles (plate, entered_at) VALUES (?, ?)",
    );
    this.#delete = connection.prepare(
      "DELETE FROM parked_vehicles WHERE plate = ? RETURNING entered_at",
    );
  }

  /** Relies on the primary key, not on a previous read, so simultaneous entries cannot both win. */
  add(vehicle: ParkedVehicle): void {
    try {
      this.#insert.run(vehicle.plate, vehicle.enteredAt.toString());
    } catch (error) {
      if ((error as { errcode?: number }).errcode === SQLITE_CONSTRAINT_PRIMARYKEY) {
        throw new VehicleAlreadyInside();
      }
      throw error;
    }
  }

  /** One statement reads and removes the row, so of two simultaneous exits only one finds it. */
  remove(plate: string): ParkedVehicle {
    const row = this.#delete.get(plate) as { entered_at: string } | undefined;
    if (row === undefined) {
      throw new VehicleNotInside();
    }
    return { plate, enteredAt: Temporal.Instant.from(row.entered_at) };
  }
}
