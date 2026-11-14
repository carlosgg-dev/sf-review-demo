import { DatabaseSync } from "node:sqlite";

export class Database {
  readonly connection: DatabaseSync;

  constructor(path: string) {
    this.connection = new DatabaseSync(path);
  }

  /** Throws when the database cannot answer a query. */
  ping(): void {
    this.connection.prepare("SELECT 1").get();
  }

  close(): void {
    this.connection.close();
  }
}
