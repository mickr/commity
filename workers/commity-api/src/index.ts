import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Bindings } from "./types";
import { commitMessageStreamHandler } from "./routes/commit-message-stream";

const app = new Hono<{ Bindings: Bindings }>();

app.use("/*", cors());

app.post("/api/commit-message/stream", commitMessageStreamHandler);

app.get("/health", (c) => c.json({ status: "ok" }));

export default app;
