import type { Duplex } from "node:stream";
import Fastify, { errorCodes, type FastifyInstance, type FastifyReply } from "fastify";
import { type CheckOut, VehicleNotInside } from "../application/check-out.ts";
import {
  InvalidPlate,
  type RegisterEntry,
  VehicleAlreadyInside,
} from "../application/register-entry.ts";

export interface DatabaseHealth {
  /** Throws when the database cannot answer a query. */
  ping(): void;
}

export interface Services {
  readonly database: DatabaseHealth;
  readonly registerEntry: RegisterEntry;
  readonly checkOut: CheckOut;
}

/** 1 MiB, the limit of the contract. */
const BODY_LIMIT = 1024 * 1024;

const MALFORMED_REQUEST_BODY = JSON.stringify({ error: "invalid_request" });

const MALFORMED_REQUEST_RESPONSE =
  "HTTP/1.1 400 Bad Request\r\n" +
  "Content-Type: application/json; charset=utf-8\r\n" +
  `Content-Length: ${String(Buffer.byteLength(MALFORMED_REQUEST_BODY))}\r\n` +
  "Connection: close\r\n" +
  "\r\n" +
  MALFORMED_REQUEST_BODY;

/** Fastify marks each rejection of the request itself with the HTTP status it calls for. */
type ServerError = Error & { readonly statusCode?: number };

interface Rejection {
  readonly status: number;
  readonly code: string;
}

const plateRequest = {
  type: "object",
  required: ["plate"],
  additionalProperties: false,
  properties: { plate: { type: "string" } },
} as const;

export function buildApp({ database, registerEntry, checkOut }: Services): FastifyInstance {
  // Fastify converts types and drops unknown fields by default; the contract rejects both.
  const app = Fastify({
    bodyLimit: BODY_LIMIT,
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
    // A path that cannot be decoded is rejected before the hooks and the error handler run.
    frameworkErrors: (error, _request, reply) => {
      void reject(reply, error);
    },
    clientErrorHandler: rejectMalformedRequest,
  });

  rejectFaultyRequests(app);

  app.get("/health", () => {
    database.ping();
    return { status: "ok" };
  });
  addEntryRoute(app, registerEntry);
  addExitRoute(app, checkOut);

  return app;
}

/** RFC 3339 with the offset of the car park at that instant. */
function timestamp(time: Temporal.ZonedDateTime): string {
  return time.toString({ timeZoneName: "never" });
}

function addEntryRoute(app: FastifyInstance, registerEntry: RegisterEntry): void {
  app.post<{ Body: { plate: string } }>(
    "/entries",
    { schema: { body: plateRequest } },
    async (request, reply) => {
      const entry = registerEntry.register(request.body.plate);
      return reply.code(201).send({ plate: entry.plate, enteredAt: timestamp(entry.enteredAt) });
    },
  );
}

function addExitRoute(app: FastifyInstance, checkOut: CheckOut): void {
  app.post<{ Body: { plate: string } }>("/exits", { schema: { body: plateRequest } }, (request) => {
    const exit = checkOut.checkOut(request.body.plate);
    return {
      plate: exit.plate,
      enteredAt: timestamp(exit.enteredAt),
      exitedAt: timestamp(exit.exitedAt),
      feeCents: exit.feeCents,
    };
  });
}

/** Every request the API cannot serve gets one `{"error": "<code>"}` answer. */
function rejectFaultyRequests(app: FastifyInstance): void {
  // Answered before the body is read, so no rule on the body decides the answer.
  app.addHook("onRequest", async (request, reply) => {
    if (request.is404) {
      await reply.code(404).send({ error: "not_found" });
    }
  });

  // Fastify rejects a malformed Content-Type before it reads the body, and so before the size check.
  app.addHook("onRequest", (request, _reply, done) => {
    if (Number(request.headers["content-length"]) > BODY_LIMIT) {
      done(new errorCodes.FST_ERR_CTP_BODY_TOO_LARGE());
      return;
    }
    done();
  });

  // Fastify rejects a media type it has no parser for without reading the body; reading it, within
  // the body limit, lets a body that is too large get 413 whatever its media type.
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_request, _body, done) => {
    done(new errorCodes.FST_ERR_CTP_INVALID_MEDIA_TYPE(), undefined);
  });

  app.setErrorHandler<ServerError>(async (error, _request, reply) => reject(reply, error));
}

function reject(reply: FastifyReply, error: ServerError): FastifyReply {
  const rejection = rejectionOf(error);
  return reply.code(rejection.status).send({ error: rejection.code });
}

/**
 * Node's HTTP parser rejects a request with an invalid Content-Length before Fastify sees it. The
 * contract leaves every other fault found there out of scope, so one answer serves them all.
 */
function rejectMalformedRequest(_error: Error, socket: Duplex): void {
  socket.write(MALFORMED_REQUEST_RESPONSE);
  socket.destroy();
}

function rejectionOf(error: ServerError): Rejection {
  if (error instanceof InvalidPlate) {
    return { status: 400, code: "invalid_plate" };
  }
  if (error instanceof VehicleAlreadyInside) {
    return { status: 409, code: "vehicle_already_inside" };
  }
  if (error instanceof VehicleNotInside) {
    return { status: 409, code: "vehicle_not_inside" };
  }
  const status = error.statusCode ?? 500;
  if (status === 413) {
    return { status, code: "invalid_request" };
  }
  if (status < 500) {
    return { status: 400, code: "invalid_request" };
  }
  // Internal details would expose the server's database and files to the client.
  return { status: 500, code: "internal_error" };
}
