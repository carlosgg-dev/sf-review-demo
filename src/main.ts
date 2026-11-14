import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { RegisterEntry } from "./application/register-entry.ts";
import { readConfig } from "./config.ts";
import { buildApp } from "./http/app.ts";
import { Database } from "./persistence/database.ts";
import { SqliteParkedVehicles } from "./persistence/parked-vehicles.ts";

const config = readConfig(process.env);
mkdirSync(dirname(config.databasePath), { recursive: true });

const database = new Database(config.databasePath);
const clock = { now: () => Temporal.Now.instant() };
const app = buildApp({
  database,
  registerEntry: new RegisterEntry(clock, new SqliteParkedVehicles(database.connection)),
});
const address = await app.listen({ host: config.host, port: config.port });
console.log(`Listening on ${address}`);
