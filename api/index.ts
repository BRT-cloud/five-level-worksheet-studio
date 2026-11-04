import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../server/routers.js";
import { createContext } from "../server/_core/context.js";
import { ENV } from "../server/_core/env.js";

const app = express();

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));

app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    aiConfigured: Boolean(ENV.aiApiKey || ENV.forgeApiKey),
    aiProvider: ENV.aiProvider,
    aiModel: ENV.aiModel,
    storageMode: "browser-local",
  });
});

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ error, path }) {
      console.error(`[tRPC Error on ${path ?? "unknown"}]:`, error);
    },
  }),
);

// Global fallback error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[Server Error]", err);
  res.status(500).json({
    error: {
      message: err instanceof Error ? err.message : "Internal Server Error",
    },
  });
});

export default app;
