import assert from "node:assert/strict";
import type { ParkingWorld } from "./world.ts";

export function assertRejected(world: ParkingWorld, status: number, error: string): void {
  assert.equal(world.response?.statusCode, status);
  assert.deepEqual(world.response.json(), { error });
}

export function assertInternalError(world: ParkingWorld): void {
  // The exact body leaves no room for a message, code, stack trace, SQL or path of the server.
  assertRejected(world, 500, "internal_error");
  assert.equal(world.response?.body, '{"error":"internal_error"}');
}
