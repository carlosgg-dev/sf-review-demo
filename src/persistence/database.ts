import { DatabaseSync } from "node:sqlite";
import { SqliteParkedVehicles } from "./parked-vehicles.ts";

export class Database {
  readonly #connection: DatabaseSync;
  readonly parkedVehicles: SqliteParkedVehicles;

  constructor(path: string) {
    this.#connection = new DatabaseSync(path);
    this.parkedVehicles = new SqliteParkedVehicles(this.#connection);
  }

  /** Throws when the database cannot answer a query. */
  ping(): void {
    this.#connection.prepare("SELECT 1").get();
  }

  close(): void {
    this.#connection.close();
  }
}
