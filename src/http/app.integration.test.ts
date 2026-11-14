import { connect } from "node:net";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CheckOut } from "../application/check-out.ts";
import { RegisterEntry } from "../application/register-entry.ts";
import { buildApp } from "./app.ts";

const INVALID_REQUEST =
  "HTTP/1.1 400 Bad Request\r\n" +
  "Content-Type: application/json; charset=utf-8\r\n" +
  "Content-Length: 27\r\n" +
  "Connection: close\r\n" +
  "\r\n" +
  '{"error":"invalid_request"}';

/** Requests the HTTP parser of Node rejects never reach inject, so they go over a real socket. */
describe("the app on a real HTTP server", () => {
  let app: FastifyInstance;
  let port: number;

  beforeAll(async () => {
    const vehicles = {
      add: () => undefined,
      remove: (plate: string) => ({
        plate,
        enteredAt: Temporal.Instant.from("2026-11-13T08:00:00Z"),
      }),
    };
    const clock = { now: () => Temporal.Instant.from("2026-11-13T08:15:00Z") };
    app = buildApp({
      database: { ping: () => undefined },
      registerEntry: new RegisterEntry(clock, vehicles),
      checkOut: new CheckOut(clock, vehicles),
    });
    await app.listen({ host: "127.0.0.1", port: 0 });
    port = (app.server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await app.close();
  });

  /** Sends raw bytes, keeping the connection open, and returns everything the server writes until the server closes it. */
  function exchange(request: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = connect(port, "127.0.0.1", () => socket.write(request));
      let response = "";
      socket.setEncoding("utf8");
      socket.on("data", (chunk: string) => (response += chunk));
      socket.on("error", reject);
      socket.on("close", () => {
        resolve(response);
      });
    });
  }

  const post = (headers: string) =>
    exchange(
      "POST /entries HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\n" +
        `${headers}\r\n\r\n{"plate":"TEST015"}`,
    );

  it.each([
    ["not a number", "Content-Length: abc"],
    ["negative", "Content-Length: -5"],
    ["signed", "Content-Length: +5"],
    ["hexadecimal", "Content-Length: 0x10"],
    ["empty", "Content-Length: "],
    ["larger than 2^64 - 1", "Content-Length: 99999999999999999999"],
    ["repeated", "Content-Length: 19\r\nContent-Length: 19"],
  ])("rejects a Content-Length that is %s", async (_case, headers) => {
    expect(await post(headers)).toBe(INVALID_REQUEST);
  });

  it.each([
    ["an unknown route", "/entries", "404 Not Found"],
    ["the exit route", "/exits", "404 Not Found"],
    ["a path that cannot be decoded", "/%c0", "400 Bad Request"],
  ])("answers HEAD to %s with its status and no body", async (_case, path, status) => {
    const response = await exchange(
      `HEAD ${path} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`,
    );

    expect(response.startsWith(`HTTP/1.1 ${status}\r\n`)).toBe(true);
    expect(response.endsWith("\r\n\r\n")).toBe(true);
  });
});
