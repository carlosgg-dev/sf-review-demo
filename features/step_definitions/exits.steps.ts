import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { assertInternalError, assertRejected } from "../support/assertions.ts";
import { madridClock } from "../support/clock.ts";
import type { ParkingWorld } from "../support/world.ts";

const PLATE = "1234ABC";

function registerExit(world: ParkingWorld, plate: string) {
  return world.postExit(JSON.stringify({ plate }), "application/json");
}

Given(
  "the server clock reads the instant {string}",
  function (this: ParkingWorld, instant: string) {
    this.now = Temporal.Instant.from(instant);
  },
);

Given("the database cannot record exits", function (this: ParkingWorld) {
  this.lockDatabase();
});

Given(
  "the booth has registered the exit of plate {string}",
  async function (this: ParkingWorld, plate: string) {
    const response = await registerExit(this, plate);
    assert.equal(response.statusCode, 200);
  },
);

When(
  "the booth registers the exit of plate {string}",
  async function (this: ParkingWorld, plate: string) {
    await registerExit(this, plate);
  },
);

When(
  "the booth sends an exit request with content type {string} and body {string}",
  async function (this: ParkingWorld, contentType: string, body: string) {
    await this.postExit(body, contentType);
  },
);

Then("the exit is accepted", function (this: ParkingWorld) {
  assert.equal(this.response?.statusCode, 200);
});

Then(
  "the response shows plate {string} entered at {string}, exited at {string} with a fee of {int} cents",
  function (this: ParkingWorld, plate: string, enteredAt: string, exitedAt: string, fee: number) {
    assert.deepEqual(this.response?.json(), { plate, enteredAt, exitedAt, feeCents: fee });
  },
);

Then("the exit is rejected because the vehicle is not inside", function (this: ParkingWorld) {
  assertRejected(this, 409, "vehicle_not_inside");
});

Then("the exit is rejected because the plate is not valid", function (this: ParkingWorld) {
  assertRejected(this, 400, "invalid_plate");
});

Then("the exit is rejected because the request is not valid", function (this: ParkingWorld) {
  assertRejected(this, 400, "invalid_request");
});

Then(
  "the exit fails with an internal error and no internal details",
  function (this: ParkingWorld) {
    assertInternalError(this);
  },
);

// The fee rules run on the check-out use case, below the HTTP interface.
Given(
  "a vehicle entered at {string} in Europe\\/Madrid",
  function (this: ParkingWorld, clock: string) {
    this.now = madridClock(clock);
    this.registerEntry?.register(PLATE);
  },
);

When("it leaves at {string} in Europe\\/Madrid", function (this: ParkingWorld, clock: string) {
  this.now = madridClock(clock);
  this.exit = this.checkOut?.checkOut(PLATE);
});

Then("the fee is {int} cents", function (this: ParkingWorld, fee: number) {
  assert.equal(this.exit?.feeCents, fee);
});
