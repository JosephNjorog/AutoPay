import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) throw new Error("DATABASE_URL is not set");

// postgres-js doesn't implement channel_binding — strip it so the Neon pooler
// URL works without libpq. SSL (sslmode=require) is handled by the driver.
const url = new URL(rawUrl);
url.searchParams.delete("channel_binding");
const connectionString = url.toString();

const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: "require",
});

export const db = drizzle(client, { schema });

export type DB = typeof db;
