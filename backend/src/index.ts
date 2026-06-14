import { serve } from "@hono/node-server";
import app from "./app";

const port = parseInt(process.env.PORT ?? "3001");

serve({ fetch: app.fetch, port }, () => {
  console.log(`\n🚀 TUMA API running on http://localhost:${port}`);
  console.log(`   Environment: ${process.env.NODE_ENV ?? "development"}`);
  console.log(`   Health: http://localhost:${port}/health\n`);
});

export default app;
