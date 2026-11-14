import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { After, Before, setWorldConstructor, World } from "@cucumber/cucumber";
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";
import { CheckOut, type Exit } from "../../src/application/check-out.ts";
import { RegisterEntry } from "../../src/application/register-entry.ts";
import { buildApp } from "../../src/http/app.ts";
import { Database } from "../../src/persistence/database.ts";
import { SqliteParkedVehicles } from "../../src/persistence/parked-vehicles.ts";

/** The app under test, on a temporary database file and a clock the scenario sets. */
export class ParkingWorld extends World {
  now = Temporal.Instant.from("2026-11-13T08:15:00Z");
  response: LightMyRequestResponse | undefined;
  #directory = "";
  #database: Database | undefined;
  #lock: DatabaseSync | undefined;
  #app: FastifyInstance | undefined;
  /** The use cases the app runs, for the fee rules checked below the interface. */
  registerEntry: RegisterEntry | undefined;
  checkOut: CheckOut | undefined;
  exit: Exit | undefined;

  start(): void {
    this.#directory = mkdtempSync(join(tmpdir(), "parking-acceptance-"));
    this.#database = new Database(this.#databasePath());
    const clock = { now: () => this.now };
    const parkedVehicles = new SqliteParkedVehicles(this.#database.connection);
    this.registerEntry = new RegisterEntry(clock, parkedVehicles);
    this.checkOut = new CheckOut(clock, parkedVehicles);
    this.#app = buildApp({
      database: this.#database,
      registerEntry: this.registerEntry,
      checkOut: this.checkOut,
    });
  }

  async stop(): Promise<void> {
    await this.#app?.close();
    this.#lock?.close();
    if (this.#database?.connection.isOpen === true) {
      this.#database.close();
    }
    rmSync(this.#directory, { recursive: true, force: true });
  }

  /**
   * Another connection holds the write lock, so the app's writes fail as on a locked database while
   * the rows can still be read.
   */
  lockDatabase(): void {
    this.#lock = new DatabaseSync(this.#databasePath());
    this.#lock.exec("BEGIN IMMEDIATE");
  }

  closeDatabase(): void {
    this.#database?.close();
  }

  async postEntry(body: string, contentType: string): Promise<LightMyRequestResponse> {
    return this.postTo("/entries", body, contentType);
  }

  async postExit(body: string, contentType: string): Promise<LightMyRequestResponse> {
    return this.postTo("/exits", body, contentType);
  }

  async postTo(url: string, body: string, contentType: string): Promise<LightMyRequestResponse> {
    return this.#send({
      method: "POST",
      url,
      headers: { "content-type": contentType },
      payload: body,
    });
  }

  async getHealth(): Promise<LightMyRequestResponse> {
    return this.#send({ method: "GET", url: "/health" });
  }

  async #send(request: InjectOptions): Promise<LightMyRequestResponse> {
    if (this.#app === undefined) {
      throw new Error("the app has not started");
    }
    this.response = await this.#app.inject(request);
    return this.response;
  }

  /** Reads the stored rows through a separate connection, as the database holds them. */
  parkedVehicles(): { plate: unknown; entered_at: unknown }[] {
    const reader = new DatabaseSync(this.#databasePath(), { readOnly: true });
    const rows = reader.prepare("SELECT plate, entered_at FROM parked_vehicles").all();
    reader.close();
    return rows.map(({ plate, entered_at }) => ({ plate, entered_at }));
  }

  #databasePath(): string {
    return join(this.#directory, "parking.db");
  }
}

setWorldConstructor(ParkingWorld);

Before(function (this: ParkingWorld) {
  this.start();
});

After(async function (this: ParkingWorld) {
  await this.stop();
});
