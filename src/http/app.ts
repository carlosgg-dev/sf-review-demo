import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
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

const entryRequest = {
  type: "object",
  required: ["plate"],
  additionalProperties: false,
  properties: { plate: { type: "string" } },
} as const;

const MALFORMED_REQUEST = new Set([
  "FST_ERR_CTP_INVALID_MEDIA_TYPE",
  "FST_ERR_CTP_EMPTY_JSON_BODY",
  "FST_ERR_CTP_INVALID_JSON_BODY",
  "FST_ERR_VALIDATION",
]);

export function buildApp({ database, registerEntry }: Services): FastifyInstance {
  // Fastify converts types and drops unknown fields by default; the contract rejects both.
  const app = Fastify({ ajv: { customOptions: { coerceTypes: false, removeAdditional: false } } });

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

  app.setErrorHandler(async (error: FastifyError, _request, reply) => {
    const rejection = rejectionOf(error);
    if (rejection === undefined) {
      throw error;
    }
    return reply.code(rejection.status).send({ error: rejection.code });
  });

  return app;
}

function rejectionOf(error: FastifyError): { status: number; code: string } | undefined {
  if (MALFORMED_REQUEST.has(error.code)) {
    return { status: 400, code: "invalid_request" };
  }
  if (error instanceof InvalidPlate) {
    return { status: 400, code: "invalid_plate" };
  }
  if (error instanceof VehicleAlreadyInside) {
    return { status: 409, code: "vehicle_already_inside" };
  }
  return undefined;
}
