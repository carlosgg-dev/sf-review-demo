import { describe, expect, it } from "vitest";
import { buildApp } from "./app.ts";

describe("GET /health", () => {
  it("reports ok when the database answers", async () => {
    const app = buildApp({ ping: () => undefined });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("fails when the database does not answer", async () => {
    const app = buildApp({
      ping: () => {
        throw new Error("database is closed");
      },
    });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(500);
  });
});
