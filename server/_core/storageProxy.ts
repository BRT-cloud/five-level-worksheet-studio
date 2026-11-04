import type { Express } from "express";
import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { ENV } from "./env.js";
import { LOCAL_STORAGE_ROOT } from "../storage.js";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      if (process.env.NODE_ENV !== "development") {
        res.status(500).send("Storage proxy not configured");
        return;
      }
      const localPath = normalize(join(LOCAL_STORAGE_ROOT, key));
      if (!localPath.startsWith(normalize(LOCAL_STORAGE_ROOT + "/"))) {
        res.status(400).send("Invalid storage key");
        return;
      }
      try {
        res.sendFile(localPath);
      } catch {
        res.status(404).send("Storage file not found");
      }
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
