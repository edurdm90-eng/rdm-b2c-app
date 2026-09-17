import { getRequestListener } from "@hono/node-server";

import { app } from "../src/app";

const requestListener = getRequestListener(app.fetch);

export default requestListener;
