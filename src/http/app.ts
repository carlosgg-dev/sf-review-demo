import Fastify, { type FastifyInstance } from "fastify";

export interface DatabaseHealth {
  /** Throws when the database cannot answer a query. */
  ping(): void;
}

export function buildApp(database: DatabaseHealth): FastifyInstance {
  const app = Fastify();

  app.get("/health", () => {
    database.ping();
    return { status: "ok" };
  });

  return app;
}
