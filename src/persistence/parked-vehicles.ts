import type { DatabaseSync, StatementSync } from "node:sqlite";
import {
  type ParkedVehicle,
  type ParkedVehicles,
  VehicleAlreadyInside,
} from "../application/register-entry.ts";

const SQLITE_CONSTRAINT_PRIMARYKEY = 1555;

export class SqliteParkedVehicles implements ParkedVehicles {
  readonly #insert: StatementSync;

  constructor(connection: DatabaseSync) {
    connection.exec(
      "CREATE TABLE IF NOT EXISTS parked_vehicles (plate TEXT PRIMARY KEY, entered_at TEXT NOT NULL)",
    );
    this.#insert = connection.prepare(
      "INSERT INTO parked_vehicles (plate, entered_at) VALUES (?, ?)",
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
}
