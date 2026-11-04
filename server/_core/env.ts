const resolvedAiApiKey =
  process.env.AI_API_KEY?.trim() ||
  process.env.GEMINI_API_KEY?.trim() ||
  process.env.GOOGLE_API_KEY?.trim() ||
  "";

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret:
    process.env.JWT_SECRET?.trim() ||
    (process.env.NODE_ENV !== "production" ? "local-development-only-cookie-secret" : ""),
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  aiProvider:
    process.env.AI_PROVIDER?.trim() ||
    (process.env.AI_API_URL?.includes("generativelanguage.googleapis.com") ||
      (!process.env.AI_API_URL && !process.env.BUILT_IN_FORGE_API_KEY)
      ? "google"
      : "openai-compatible"),
  aiApiUrl: process.env.AI_API_URL ?? "",
  aiApiKey: resolvedAiApiKey,
  aiModel: process.env.AI_MODEL?.trim() || "gemini-3.8-flash",
};
