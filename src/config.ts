export interface Config {
  readonly host: string;
  readonly port: number;
  readonly databasePath: string;
}

export function readConfig(env: Record<string, string | undefined>): Config {
  return {
    host: required(env, "HOST"),
    port: port(required(env, "PORT")),
    databasePath: required(env, "DATABASE_PATH"),
  };
}

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

function port(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return parsed;
}
