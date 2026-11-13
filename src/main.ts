import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { readConfig } from "./config.ts";
import { buildApp } from "./http/app.ts";
import { Database } from "./persistence/database.ts";

const config = readConfig(process.env);
mkdirSync(dirname(config.databasePath), { recursive: true });

const app = buildApp(new Database(config.databasePath));
const address = await app.listen({ host: config.host, port: config.port });
console.log(`Listening on ${address}`);
