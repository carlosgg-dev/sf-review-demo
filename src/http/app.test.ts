import { describe, expect, it } from "vitest";
import {
  type ParkedVehicle,
  RegisterEntry,
  VehicleAlreadyInside,
} from "../application/register-entry.ts";
import { buildApp } from "./app.ts";

function appWith({
  ping = () => undefined,
  now = "2026-11-13T08:15:00Z",
  inside = [] as ParkedVehicle[],
} = {}) {
  const vehicles = {
    add(vehicle: ParkedVehicle) {
      if (inside.some(({ plate }) => plate === vehicle.plate)) {
        throw new VehicleAlreadyInside();
      }
      inside.push(vehicle);
    },
  };
  const clock = { now: () => Temporal.Instant.from(now) };
  return buildApp({ database: { ping }, registerEntry: new RegisterEntry(clock, vehicles) });
}

describe("GET /health", () => {
  it("reports ok when the database answers", async () => {
    const app = appWith();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("fails when the database does not answer", async () => {
    const app = appWith({
      ping: () => {
        throw new Error("database is closed");
      },
    });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ message: "database is closed" });
  });
});

describe("POST /entries", () => {
  const post = (app: ReturnType<typeof appWith>, payload: string, contentType?: string) =>
    app.inject({
      method: "POST",
      url: "/entries",
      payload,
      headers: contentType === undefined ? {} : { "content-type": contentType },
    });

  it("registers the entry and answers with the plate and the Madrid entry time", async () => {
    const inside: ParkedVehicle[] = [];
    const app = appWith({ now: "2026-07-01T07:15:00.750Z", inside });

    const response = await post(app, '{"plate":"1234-abc"}', "application/json; charset=utf-8");

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ plate: "1234ABC", enteredAt: "2026-07-01T09:15:00+02:00" });
    expect(inside.map(({ plate }) => plate)).toEqual(["1234ABC"]);
  });

  it("rejects a plate that is not valid", async () => {
    const inside: ParkedVehicle[] = [];

    const response = await post(appWith({ inside }), '{"plate":"12#4"}', "application/json");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_plate" });
    expect(inside).toEqual([]);
  });

  it("rejects a vehicle already inside", async () => {
    const first = { plate: "1234ABC", enteredAt: Temporal.Instant.from("2026-11-13T08:15:00Z") };
    const inside = [first];

    const response = await post(appWith({ inside }), '{"plate":"1234 abc"}', "application/json");

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "vehicle_already_inside" });
    expect(inside).toEqual([first]);
  });

  it.each([
    [
      "an entry time",
      '{"plate":"TEST003","enteredAt":"2026-01-01T00:00:00+01:00"}',
      "application/json",
    ],
    ["a number as plate", '{"plate":1234}', "application/json"],
    ["a null plate", '{"plate":null}', "application/json"],
    ["a boolean plate", '{"plate":true}', "application/json"],
    ["a list of plates", '{"plate":["TEST003"]}', "application/json"],
    ["a missing plate", "{}", "application/json"],
    ["a list as body", '["TEST003"]', "application/json"],
    ["a null body", "null", "application/json"],
    ["malformed JSON", '{"plate":', "application/json"],
    ["an empty body", "", "application/json"],
    ["a text body", '{"plate":"TEST003"}', "text/plain"],
    ["another media type", '{"plate":"TEST003"}', "application/xml"],
    ["no content type", '{"plate":"TEST003"}', undefined],
  ])("rejects a request with %s", async (_case, payload, contentType) => {
    const inside: ParkedVehicle[] = [];

    const response = await post(appWith({ inside }), payload, contentType);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_request" });
    expect(inside).toEqual([]);
  });

  it("rejects a malformed request before checking the plate", async () => {
    const response = await post(appWith(), '{"plate":"12#4","extra":1}', "application/json");

    expect(response.json()).toEqual({ error: "invalid_request" });
  });
});
