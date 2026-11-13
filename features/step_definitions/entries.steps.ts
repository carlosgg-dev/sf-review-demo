import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import type { ParkingWorld } from "../support/world.ts";

/** The scenarios write a character that cannot be typed in a table as \uXXXX. */
function unescape(plate: string): string {
  return plate.replace(/\\u([0-9A-Fa-f]{4})/g, (_match, hex: string) =>
    String.fromCodePoint(parseInt(hex, 16)),
  );
}

function registerEntry(world: ParkingWorld, plate: string) {
  return world.postEntry(JSON.stringify({ plate: unescape(plate) }), "application/json");
}

function assertRejected(world: ParkingWorld, status: number, error: string): void {
  assert.equal(world.response?.statusCode, status);
  assert.deepEqual(world.response.json(), { error });
}

Given(
  "the server clock reads {string} in Europe\\/Madrid",
  function (this: ParkingWorld, clock: string) {
    this.now = Temporal.PlainDateTime.from(clock.replace(" ", "T"))
      .toZonedDateTime("Europe/Madrid")
      .toInstant();
  },
);

Given(
  "the booth has registered the entry of plate {string}",
  async function (this: ParkingWorld, plate: string) {
    const response = await registerEntry(this, plate);
    assert.equal(response.statusCode, 201);
  },
);

When(
  "the booth registers the entry of plate {string}",
  async function (this: ParkingWorld, plate: string) {
    await registerEntry(this, plate);
  },
);

When(
  "the booth sends an entry request with content type {string} and body {string}",
  async function (this: ParkingWorld, contentType: string, body: string) {
    await this.postEntry(body, contentType);
  },
);

Then("the entry is accepted", function (this: ParkingWorld) {
  assert.equal(this.response?.statusCode, 201);
});

Then(
  "the response shows plate {string} entered at {string}",
  function (this: ParkingWorld, plate: string, enteredAt: string) {
    assert.deepEqual(this.response?.json(), { plate, enteredAt });
  },
);

Then("the entry is rejected because the vehicle is already inside", function (this: ParkingWorld) {
  assertRejected(this, 409, "vehicle_already_inside");
});

Then("the entry is rejected because the plate is not valid", function (this: ParkingWorld) {
  assertRejected(this, 400, "invalid_plate");
});

Then("the entry is rejected because the request is not valid", function (this: ParkingWorld) {
  assertRejected(this, 400, "invalid_request");
});

Then(
  "the vehicle with plate {string} is recorded as inside since {string}",
  function (this: ParkingWorld, plate: string, enteredAt: string) {
    assert.deepEqual(this.parkedVehicles(), [
      { plate, entered_at: Temporal.Instant.from(enteredAt).toString() },
    ]);
  },
);

Then("no vehicle is inside", function (this: ParkingWorld) {
  assert.deepEqual(this.parkedVehicles(), []);
});
