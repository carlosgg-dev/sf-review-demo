import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { CheckOut, VehicleNotInside } from "../application/check-out.ts";
import {
  type ParkedVehicle,
  RegisterEntry,
  VehicleAlreadyInside,
} from "../application/register-entry.ts";
import { buildApp } from "./app.ts";

const ONE_MIB = 1024 * 1024;
const INTERNAL_ERROR = { error: "internal_error" };
const BOM = "\uFEFF";

function appWith({
  ping = () => undefined,
  now = "2026-11-13T08:15:00Z",
  inside = [] as ParkedVehicle[],
  failure = undefined as Error | undefined,
} = {}) {
  const vehicles = {
    add(vehicle: ParkedVehicle) {
      if (failure !== undefined) {
        throw failure;
      }
      if (inside.some(({ plate }) => plate === vehicle.plate)) {
        throw new VehicleAlreadyInside();
      }
      inside.push(vehicle);
    },
    remove(plate: string) {
      if (failure !== undefined) {
        throw failure;
      }
      const index = inside.findIndex((vehicle) => vehicle.plate === plate);
      if (index === -1) {
        throw new VehicleNotInside();
      }
      return inside.splice(index, 1)[0] as ParkedVehicle;
    },
  };
  const clock = { now: () => Temporal.Instant.from(now) };
  return buildApp({
    database: { ping },
    registerEntry: new RegisterEntry(clock, vehicles),
    checkOut: new CheckOut(clock, vehicles),
  });
}

describe("GET /health", () => {
  it("reports ok when the database answers", async () => {
    const app = appWith();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("fails with no internal details when the database does not answer", async () => {
    const app = appWith({
      ping: () => {
        throw new Error("database is closed");
      },
    });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(INTERNAL_ERROR);
    expect(response.body).not.toContain("closed");
  });

  it("answers HEAD like GET without a body", async () => {
    const response = await appWith().inject({ method: "HEAD", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("");
  });
});

describe("an unknown route or method", () => {
  it.each([
    ["GET", "/entries", undefined, ""],
    ["GET", "/exits", undefined, ""],
    ["POST", "/exit", "application/json", '{"plate":"TEST009"}'],
    ["POST", "/health", "application/json", '{"plate":"TEST009"}'],
    ["POST", "/entry", "application/json", '{"plate":"TEST009"}'],
    ["POST", "/entry", "text/plain", '{"plate":"TEST009"}'],
    ["POST", "/entry", "application/json", '{"plate":'],
    ["POST", "/entry", "application/json", `{"plate":"TEST009"}${" ".repeat(ONE_MIB)}`],
  ] as const)("answers %s %s (%s) as not found", async (method, url, contentType, payload) => {
    const inside: ParkedVehicle[] = [];

    const response = await appWith({ inside }).inject({
      method,
      url,
      payload,
      headers: contentType === undefined ? {} : { "content-type": contentType },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "not_found" });
    expect(inside).toEqual([]);
  });
});

describe("a URL whose path cannot be decoded", () => {
  it.each([
    ["GET", "/%c0"],
    ["POST", "/entries%c0"],
    ["POST", "/entries%zz"],
    ["GET", "/%zz"],
    ["GET", "/health%"],
    ["GET", "/%E0%A4%A"],
  ] as const)("rejects %s %s without repeating the URL", async (method, url) => {
    const inside: ParkedVehicle[] = [];

    const response = await appWith({ inside }).inject({
      method,
      url,
      payload: '{"plate":"TEST014"}',
      headers: { "content-type": "application/json" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toBe('{"error":"invalid_request"}');
    expect(inside).toEqual([]);
  });
});

describe("POST /entries", () => {
  const post = (
    app: ReturnType<typeof appWith>,
    payload: string | Buffer | Readable,
    contentType?: string,
    headers: Record<string, string> = {},
  ) =>
    app.inject({
      method: "POST",
      url: "/entries",
      payload,
      headers: contentType === undefined ? headers : { ...headers, "content-type": contentType },
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

  it.each(["utf-8", "iso-8859-1", "windows-1252"])("accepts any charset %s", async (charset) => {
    const response = await post(
      appWith(),
      '{"plate":"TEST004"}',
      `application/json; charset=${charset}`,
    );

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ plate: "TEST004" });
  });

  it("reads a byte that is not UTF-8 inside the plate as a character that is not on a plate", async () => {
    const body = Buffer.concat([
      Buffer.from('{"plate":"'),
      Buffer.from([0xd1]),
      Buffer.from('AB123"}'),
    ]);

    const response = await post(appWith(), body, "application/json; charset=iso-8859-1");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_plate" });
  });

  it("rejects a byte that is not UTF-8 outside the plate as a malformed request", async () => {
    const body = Buffer.concat([Buffer.from('{"plate":"TEST004"}'), Buffer.from([0xd1])]);

    const response = await post(appWith(), body, "application/json");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_request" });
  });

  it("ignores one byte order mark before the body", async () => {
    const inside: ParkedVehicle[] = [];

    const response = await post(
      appWith({ inside }),
      `${BOM}{"plate":"TEST003"}`,
      "application/json",
    );

    expect(response.statusCode).toBe(201);
    expect(inside.map(({ plate }) => plate)).toEqual(["TEST003"]);
  });

  it.each([
    ["two byte order marks", `${BOM}${BOM}{"plate":"TEST003"}`],
    ["only a byte order mark", BOM],
    ["a byte order mark after whitespace", ` ${BOM}{"plate":"TEST003"}`],
    ["a byte order mark after the JSON value", `{"plate":"TEST003"}${BOM}`],
  ])("rejects a body with %s as a malformed request", async (_case, payload) => {
    const response = await post(appWith(), payload, "application/json");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_request" });
  });

  it("rejects a byte order mark inside the plate as a plate that is not valid", async () => {
    const response = await post(appWith(), `{"plate":"${BOM}TEST003"}`, "application/json");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_plate" });
  });

  it("does not read a query string that cannot be decoded", async () => {
    const response = await appWith().inject({
      method: "POST",
      url: "/entries?a=%c0",
      payload: '{"plate":"TEST003"}',
      headers: { "content-type": "application/json" },
    });

    expect(response.statusCode).toBe(201);
  });

  it("uses the last value of a repeated plate", async () => {
    const inside: ParkedVehicle[] = [];

    const response = await post(
      appWith({ inside }),
      '{"plate":"TEST005","plate":"TEST006"}',
      "application/json",
    );

    expect(response.statusCode).toBe(201);
    expect(inside.map(({ plate }) => plate)).toEqual(["TEST006"]);
  });

  it("checks the last value of a repeated plate", async () => {
    const response = await post(
      appWith(),
      '{"plate":"TEST005","plate":"12#4"}',
      "application/json",
    );

    expect(response.json()).toEqual({ error: "invalid_plate" });
  });

  it("rejects a request whose length does not match its body", async () => {
    const response = await post(appWith(), '{"plate":"TEST003"}', "application/json", {
      "content-length": "5",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_request" });
  });

  it.each([
    ["JSON", "application/json"],
    ["text", "text/plain"],
    ["no content type", undefined],
    ["a malformed content type", "json"],
  ])(
    "rejects a body larger than 1 MiB as %s before checking its form",
    async (_case, contentType) => {
      const inside: ParkedVehicle[] = [];

      const response = await post(
        appWith({ inside }),
        `{"plate":"TEST008"}${" ".repeat(ONE_MIB)}`,
        contentType,
      );

      expect(response.statusCode).toBe(413);
      expect(response.json()).toEqual({ error: "invalid_request" });
      expect(inside).toEqual([]);
    },
  );

  it("rejects a body larger than 1 MiB sent in chunks before checking its form", async () => {
    const response = await post(
      appWith(),
      Readable.from([`{"plate":"TEST008"}`, " ".repeat(ONE_MIB)]),
      "application/xml",
    );

    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({ error: "invalid_request" });
  });

  it("checks the form of a body of exactly 1 MiB", async () => {
    const response = await post(appWith(), " ".repeat(ONE_MIB), "json");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_request" });
  });

  it("accepts a body of exactly 1 MiB", async () => {
    const plate = '{"plate":"TEST008"}';

    const response = await post(
      appWith(),
      plate + " ".repeat(ONE_MIB - plate.length),
      "application/json",
    );

    expect(response.statusCode).toBe(201);
  });

  it("fails with no internal details when the entry cannot be recorded", async () => {
    const failure = Object.assign(new Error("attempt to write a readonly database"), {
      code: "ERR_SQLITE_ERROR",
    });

    const response = await post(appWith({ failure }), '{"plate":"TEST007"}', "application/json");

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(INTERNAL_ERROR);
    expect(response.body).not.toMatch(/readonly|SQLITE/);
  });

  it("rejects a malformed request before checking the plate", async () => {
    const response = await post(appWith(), '{"plate":"12#4","extra":1}', "application/json");

    expect(response.json()).toEqual({ error: "invalid_request" });
  });
});

describe("POST /exits", () => {
  const parked = (plate: string, enteredAt: string) => ({
    plate,
    enteredAt: Temporal.Instant.from(enteredAt),
  });

  const post = (
    app: ReturnType<typeof appWith>,
    payload: string,
    contentType = "application/json",
  ) =>
    app.inject({
      method: "POST",
      url: "/exits",
      payload,
      headers: { "content-type": contentType },
    });

  it("closes the stay and answers with the plate, both Madrid times and the fee", async () => {
    const inside = [parked("1234ABC", "2026-07-01T07:00:00Z")];
    const app = appWith({ now: "2026-07-01T09:15:00.900Z", inside });

    const response = await post(app, '{"plate":"1234-abc"}');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      plate: "1234ABC",
      enteredAt: "2026-07-01T09:00:00+02:00",
      exitedAt: "2026-07-01T11:15:00+02:00",
      feeCents: 500,
    });
    expect(inside).toEqual([]);
  });

  it("rejects a vehicle that is not inside", async () => {
    const response = await post(appWith(), '{"plate":"1234ABC"}');

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "vehicle_not_inside" });
  });

  it("rejects a plate that is not valid and closes no stay", async () => {
    const inside = [parked("1234ABC", "2026-11-13T08:00:00Z")];

    const response = await post(appWith({ inside }), '{"plate":"12#4"}');

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_plate" });
    expect(inside).toHaveLength(1);
  });

  it.each([
    [
      "an exit time",
      '{"plate":"TEST003","exitedAt":"2026-11-13T09:10:00+01:00"}',
      "application/json",
    ],
    ["a number as plate", '{"plate":1234}', "application/json"],
    ["a missing plate", "{}", "application/json"],
    ["malformed JSON", '{"plate":"TEST003"', "application/json"],
    ["a text body", '{"plate":"TEST003"}', "text/plain"],
  ])("rejects a request with %s and closes no stay", async (_case, payload, contentType) => {
    const inside = [parked("TEST003", "2026-11-13T08:00:00Z")];

    const response = await post(appWith({ inside }), payload, contentType);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_request" });
    expect(inside).toHaveLength(1);
  });

  it("rejects a body larger than 1 MiB", async () => {
    const response = await post(appWith(), `{"plate":"TEST008"}${" ".repeat(ONE_MIB)}`);

    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({ error: "invalid_request" });
  });

  it("fails with no internal details when the exit cannot be recorded", async () => {
    const failure = new Error("database is locked");

    const response = await post(appWith({ failure }), '{"plate":"TEST007"}');

    expect(response.statusCode).toBe(500);
    expect(response.body).toBe('{"error":"internal_error"}');
  });
});
