import Fastify, { errorCodes, type FastifyInstance } from "fastify";
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
}

/** 1 MiB, the limit of the contract. */
const BODY_LIMIT = 1024 * 1024;

/** Fastify marks each rejection of the request itself with the HTTP status it calls for. */
type ServerError = Error & { readonly statusCode?: number };

interface Rejection {
  readonly status: number;
  readonly code: string;
}

const entryRequest = {
  type: "object",
  required: ["plate"],
  additionalProperties: false,
  properties: { plate: { type: "string" } },
} as const;

export function buildApp({ database, registerEntry }: Services): FastifyInstance {
  // Fastify converts types and drops unknown fields by default; the contract rejects both.
  const app = Fastify({
    bodyLimit: BODY_LIMIT,
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
  });

  rejectFaultyRequests(app);

  app.get("/health", () => {
    database.ping();
    return { status: "ok" };
  });

  app.post<{ Body: { plate: string } }>(
    "/entries",
    { schema: { body: entryRequest } },
    async (request, reply) => {
      const entry = registerEntry.register(request.body.plate);
      return reply.code(201).send({
        plate: entry.plate,
        enteredAt: entry.enteredAt.toString({ timeZoneName: "never" }),
      });
    },
  );

  return app;
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

  app.setErrorHandler<ServerError>(async (error, _request, reply) => {
    const rejection = rejectionOf(error);
    return reply.code(rejection.status).send({ error: rejection.code });
  });
}

function rejectionOf(error: ServerError): Rejection {
  if (error instanceof InvalidPlate) {
    return { status: 400, code: "invalid_plate" };
  }
  if (error instanceof VehicleAlreadyInside) {
    return { status: 409, code: "vehicle_already_inside" };
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
