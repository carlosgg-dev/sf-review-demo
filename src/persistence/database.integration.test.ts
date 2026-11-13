import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Database } from "./database.ts";

describe("Database", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "parking-"));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("opens a database file that answers queries", () => {
    const path = join(directory, "parking.db");
    const database = new Database(path);

    expect(() => {
      database.ping();
    }).not.toThrow();
    database.close();
    expect(existsSync(path)).toBe(true);
  });

  it("stops answering once closed", () => {
    const database = new Database(join(directory, "parking.db"));
    database.close();

    expect(() => {
      database.ping();
    }).toThrow();
  });
});
