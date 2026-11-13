import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { After, Before, setWorldConstructor, World } from "@cucumber/cucumber";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { RegisterEntry } from "../../src/application/register-entry.ts";
import { buildApp } from "../../src/http/app.ts";
import { Database } from "../../src/persistence/database.ts";

/** The app under test, on a temporary database file and a clock the scenario sets. */
export class ParkingWorld extends World {
  now = Temporal.Instant.from("2026-11-13T08:15:00Z");
  response: LightMyRequestResponse | undefined;
  #directory = "";
  #database: Database | undefined;
  #app: FastifyInstance | undefined;

  start(): void {
    this.#directory = mkdtempSync(join(tmpdir(), "parking-acceptance-"));
    this.#database = new Database(this.#databasePath());
    const clock = { now: () => this.now };
    this.#app = buildApp({
      database: this.#database,
      registerEntry: new RegisterEntry(clock, this.#database.parkedVehicles),
    });
  }

  async stop(): Promise<void> {
    await this.#app?.close();
    this.#database?.close();
    rmSync(this.#directory, { recursive: true, force: true });
  }

  async postEntry(body: string, contentType: string): Promise<LightMyRequestResponse> {
    if (this.#app === undefined) {
      throw new Error("the app has not started");
    }
    this.response = await this.#app.inject({
      method: "POST",
      url: "/entries",
      headers: { "content-type": contentType },
      payload: body,
    });
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
