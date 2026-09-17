import { serve } from "@hono/node-server";
import { env } from "@rdm-b2c/env/server";

import { app } from "./app";
import { startSettlementWorker } from "./settlement-worker";

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
    startSettlementWorker();
  },
);
