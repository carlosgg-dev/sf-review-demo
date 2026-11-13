import { describe, expect, it } from "vitest";
import { readConfig } from "./config.ts";

const valid = { HOST: "127.0.0.1", PORT: "3000", DATABASE_PATH: "data/parking.db" };

describe("readConfig", () => {
  it("reads every setting from the environment", () => {
    expect(readConfig(valid)).toEqual({
      host: "127.0.0.1",
      port: 3000,
      databasePath: "data/parking.db",
    });
  });

  it.each(["HOST", "PORT", "DATABASE_PATH"])("rejects a missing %s", (name) => {
    expect(() => readConfig({ ...valid, [name]: undefined })).toThrow(
      `Missing environment variable ${name}`,
    );
  });

  it("rejects an empty setting", () => {
    expect(() => readConfig({ ...valid, HOST: "" })).toThrow("Missing environment variable HOST");
  });

  it.each(["1", "65535"])("accepts port %s", (port) => {
    expect(readConfig({ ...valid, PORT: port }).port).toBe(Number(port));
  });

  it.each(["0", "65536", "3000.5", "abc"])("rejects port %s", (port) => {
    expect(() => readConfig({ ...valid, PORT: port })).toThrow(`Invalid PORT: ${port}`);
  });
});
