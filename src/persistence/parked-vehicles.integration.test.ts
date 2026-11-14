import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VehicleAlreadyInside } from "../application/register-entry.ts";
import { Database } from "./database.ts";
import { SqliteParkedVehicles } from "./parked-vehicles.ts";

const vehicle = (plate: string, enteredAt: string) => ({
  plate,
  enteredAt: Temporal.Instant.from(enteredAt),
});

describe("SqliteParkedVehicles", () => {
  let path: string;
  let database: Database;
  let parkedVehicles: SqliteParkedVehicles;

  function open(): void {
    database = new Database(path);
    parkedVehicles = new SqliteParkedVehicles(database.connection);
  }

  beforeEach(() => {
    path = join(mkdtempSync(join(tmpdir(), "parking-")), "parking.db");
    open();
  });

  afterEach(() => {
    database.close();
    rmSync(join(path, ".."), { recursive: true, force: true });
  });

  function rows() {
    const reader = new DatabaseSync(path, { readOnly: true });
    const result = reader.prepare("SELECT plate, entered_at FROM parked_vehicles").all();
    reader.close();
    return result.map((row) => ({ ...row }));
  }

  it("stores each vehicle with its entry instant in UTC", () => {
    parkedVehicles.add(vehicle("1234ABC", "2026-11-13T08:15:00Z"));
    parkedVehicles.add(vehicle("TEST001", "2026-07-01T07:15:00Z"));

    expect(rows()).toEqual([
      { plate: "1234ABC", entered_at: "2026-11-13T08:15:00Z" },
      { plate: "TEST001", entered_at: "2026-07-01T07:15:00Z" },
    ]);
  });

  it("rejects a plate already inside and keeps its entry time", () => {
    parkedVehicles.add(vehicle("1234ABC", "2026-11-13T08:15:00Z"));

    expect(() => {
      parkedVehicles.add(vehicle("1234ABC", "2026-11-13T09:40:00Z"));
    }).toThrow(VehicleAlreadyInside);
    expect(rows()).toEqual([{ plate: "1234ABC", entered_at: "2026-11-13T08:15:00Z" }]);
  });

  it("keeps the vehicles inside after a restart", () => {
    parkedVehicles.add(vehicle("1234ABC", "2026-11-13T08:15:00Z"));
    database.close();
    open();

    expect(() => {
      parkedVehicles.add(vehicle("1234ABC", "2026-11-13T09:40:00Z"));
    }).toThrow(VehicleAlreadyInside);
  });

  it("passes on any other database failure", () => {
    database.close();

    let failure: unknown;
    try {
      parkedVehicles.add(vehicle("1234ABC", "2026-11-13T08:15:00Z"));
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(VehicleAlreadyInside);
    open();
  });
});
