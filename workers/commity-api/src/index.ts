import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Bindings } from "./types";
import { commitMessageHandler } from "./routes/commit-message";
import { generateHandler } from "./routes/generate";

const app = new Hono<{ Bindings: Bindings }>();

app.use("/*", cors());

app.post("/api/commit-message", commitMessageHandler);
app.post("/api/generate", generateHandler);

app.get("/health", (c) => c.json({ status: "ok" }));

export default app;
