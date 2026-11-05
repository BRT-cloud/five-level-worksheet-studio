import { ENV } from "./env.js";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  model?: string;
  thinking?: {
    type: "enabled";
    budget_tokens?: number;
  };
  reasoning?: {
    effort?: "low" | "medium" | "high";
  };
  maxTokens?: number;
  max_tokens?: number;
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: string;
  }>;
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text" || part.type === "image_url" || part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role: "tool" as const,
      content,
      name,
      tool_call_id,
    };
  }

  const parts = ensureArray(message.content).map(normalizeContentPart);
  return {
    role,
    name,
    tool_call_id,
    content: parts.length === 1 && parts[0]?.type === "text" ? parts[0].text : parts,
  };
};

export const toGeminiContents = (messages: Message[]) => {
  return messages
    .filter(m => m.role !== "system")
    .map(message => {
      const parts = ensureArray(message.content).map(part => {
        if (typeof part === "string") {
          return { text: part };
        }
        if (part.type === "text") {
          return { text: part.text };
        }
        if (part.type === "image_url") {
          const raw = part.image_url.url;
          const match = raw.match(/^data:([^;]+);base64,(.+)$/);
          if (match && match[1] && match[2]) {
            return {
              inlineData: {
                mimeType: match[1],
                data: match[2],
              },
            };
          }
          return { text: `[이미지 URL: ${raw}]` };
        }
        if (part.type === "file_url") {
          const raw = part.file_url.url;
          const match = raw.match(/^data:([^;]+);base64,(.+)$/);
          if (match && match[1] && match[2]) {
            return {
              inlineData: {
                mimeType: part.file_url.mime_type || match[1],
                data: match[2],
              },
            };
          }
          return { text: `[파일 URL: ${raw}]` };
        }
        return { text: "" };
      });

      return {
        role: message.role === "assistant" ? "model" : "user",
        parts,
      };
    });
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): Record<string, unknown> | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "required") {
    return { type: toolChoice };
  }

  if (toolChoice === "auto") {
    if (tools && tools.length > 0) {
      return {
        type: "function",
        function: { name: tools[0].function.name },
      };
    }
    return { type: "auto" };
  }

  if ("type" in toolChoice && toolChoice.type === "function") {
    return toolChoice;
  }

  if (!tools || tools.length === 0) {
    return undefined;
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const resolveApiUrl = () =>
  ENV.aiApiUrl.trim()
    ? ENV.aiApiUrl.replace(/\/$/, "")
    : ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
      ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
      : "https://forge.manus.im/v1/chat/completions";

const assertApiKey = () => {
  if (!ENV.aiApiKey && !ENV.forgeApiKey) {
    throw new Error("AI_API_KEY(또는 GEMINI_API_KEY)가 설정되지 않았습니다.");
  }
};

const resolveApiKey = () => ENV.aiApiKey || ENV.forgeApiKey;

export function isGoogleProvider() {
  return ENV.aiProvider.toLowerCase() === "google";
}

export function toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "additionalProperties" || key === "$schema") continue;
    if (Array.isArray(value)) {
      result[key] = value.map(item =>
        item && typeof item === "object"
          ? toGeminiSchema(item as Record<string, unknown>)
          : item
      );
    } else if (value && typeof value === "object") {
      result[key] = toGeminiSchema(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}): ResponseFormat | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

const RETRY_MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;
const RETRY_MAX_DELAY_MS = 3_500;
const REQUEST_TIMEOUT_MS = 45_000;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

const parseRetryAfter = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
};

const computeBackoffDelay = (
  attempt: number,
  retryAfterMs?: number
): number => {
  const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  const jittered = cap / 2 + Math.random() * (cap / 2);
  return Math.min(Math.max(jittered, retryAfterMs ?? 0), RETRY_MAX_DELAY_MS);
};

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
}

function sanitizeErrorDetail(raw: string): string {
  const key = resolveApiKey();
  let cleaned = raw.replace(/key=[A-Za-z0-9_-]+/gi, "key=[REDACTED]");
  if (key && key.length > 4) {
    cleaned = cleaned.split(key).join("[REDACTED]");
  }
  return cleaned.trim().slice(0, 300);
}

const fetchWithBackoff = async (
  url: string,
  init: FetchInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
  maxRetries = RETRY_MAX_RETRIES
): Promise<Response> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        signal: init.signal ?? controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok || !isRetryableStatus(response.status) || attempt === maxRetries) {
        return response;
      }

      const retryAfterMs = parseRetryAfter(
        response.headers.get("retry-after")
      );
      try {
        await response.body?.cancel();
      } catch {
        // Body already settled
      }
      console.warn(
        `LLM request retry ${attempt + 1}/${maxRetries} after status ${response.status}`
      );
      await sleep(computeBackoffDelay(attempt, retryAfterMs));
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      if (attempt === maxRetries) throw error;
      console.warn(
        `LLM request retry ${attempt + 1}/${maxRetries} after network error`
      );
      await sleep(computeBackoffDelay(attempt));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("AI 서버 응답 시간이 초과되었거나 연결에 실패했습니다.");
};

export const GEMINI_FALLBACK_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
] as const;

// Cached dynamic model discovery to guarantee safety against future Google deprecations
let discoveredGeminiModels: string[] | null = null;
let lastDiscoveryTime = 0;
const DISCOVERY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function discoverActiveGeminiModels(apiKey: string): Promise<string[]> {
  const now = Date.now();
  if (discoveredGeminiModels && now - lastDiscoveryTime < DISCOVERY_CACHE_TTL_MS) {
    return discoveredGeminiModels;
  }
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(endpoint);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
    };
    if (!data.models) return [];
    const active = data.models
      .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
      .map(m => (m.name || "").replace(/^models\//, ""))
      .filter(name => name.includes("flash"));

    if (active.length > 0) {
      discoveredGeminiModels = active;
      lastDiscoveryTime = now;
      return active;
    }
  } catch {
    // Dynamic discovery is best-effort
  }
  return [];
}

export function buildGeminiPayload(
  messages: Message[],
  resolvedMaxTokens: number | undefined,
  normalizedResponseFormat: ResponseFormat | undefined
) {
  const system = messages.find(message => message.role === "system");
  const basePayload: Record<string, unknown> = {
    contents: toGeminiContents(messages),
    generationConfig: {
      maxOutputTokens: resolvedMaxTokens,
      responseMimeType:
        normalizedResponseFormat?.type === "json_schema" ||
        normalizedResponseFormat?.type === "json_object"
          ? "application/json"
          : "text/plain",
      ...(normalizedResponseFormat?.type === "json_schema"
        ? { responseSchema: toGeminiSchema(normalizedResponseFormat.json_schema.schema) }
        : {}),
    },
  };

  if (system) {
    basePayload.systemInstruction = {
      parts: [
        {
          text: ensureArray(system.content)
            .map(part => (typeof part === "string" ? part : part.type === "text" ? part.text : ""))
            .join("\n"),
        },
      ],
    };
  }

  return basePayload;
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    thinking,
    reasoning,
    maxTokens,
    max_tokens,
  } = params;

  const payload: Record<string, unknown> = {
    messages: messages.map(normalizeMessage),
  };

  if (model) {
    payload.model = model;
  }

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  const resolvedMaxTokens = max_tokens ?? maxTokens;
  if (typeof resolvedMaxTokens === "number") {
    payload.max_tokens = resolvedMaxTokens;
  }

  if (thinking) {
    payload.thinking = thinking;
  }
  if (reasoning) {
    payload.reasoning = reasoning;
  }

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  if (isGoogleProvider()) {
    const apiKey = resolveApiKey();
    const geminiPayload = buildGeminiPayload(messages, resolvedMaxTokens, normalizedResponseFormat);
    const googleBase = (ENV.aiApiUrl || "https://generativelanguage.googleapis.com/v1beta/models").replace(/\/$/, "");
    const primaryModel = model || ENV.aiModel || "gemini-2.5-flash-lite";

    // 1. Gather all candidate models in priority order
    let candidateModels = Array.from(new Set([primaryModel, ...GEMINI_FALLBACK_MODELS]));

    let response: Response | null = null;
    let activeModel = primaryModel;
    let lastErrorDetail = "";

    // 2. Iterate through models with quick per-attempt failover on 503, 429, 404, 5xx, or timeouts
    for (let i = 0; i < candidateModels.length; i++) {
      activeModel = candidateModels[i];
      const endpoint = `${googleBase}/${activeModel}:generateContent?key=${encodeURIComponent(apiKey)}`;

      // Apply fast 20s timeout per model attempt to prevent Vercel serverless freeze
      try {
        response = await fetchWithBackoff(
          endpoint,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(geminiPayload),
          },
          20_000,
          0 // 0 retries on the same model: failover immediately to sibling model on congestion
        );
      } catch (networkOrTimeoutErr) {
        lastErrorDetail = networkOrTimeoutErr instanceof Error ? networkOrTimeoutErr.message : "Request timeout";
        console.warn(`[LLM] Gemini model '${activeModel}' timed out / connection failed (${lastErrorDetail}); rotating to next model.`);
        response = null;
      }

      // If response is successful (200), proceed immediately
      if (response && response.ok) {
        break;
      }

      // If status indicates temporary congestion (503), rate limit (429), not found (404), or server error (500/502/504)
      const status = response?.status;
      const shouldFailover =
        response === null ||
        status === 503 ||
        status === 429 ||
        status === 404 ||
        status === 500 ||
        status === 502 ||
        status === 504 ||
        status === 400; // Catch 400 for model-specific configuration rejections

      if (shouldFailover) {
        if (response) {
          try {
            const body = await response.text();
            lastErrorDetail = body;
            await response.body?.cancel();
          } catch {
            // ignore
          }
        }
        const nextModel = candidateModels[i + 1];
        if (nextModel) {
          console.warn(`[LLM] Gemini model '${activeModel}' returned status ${status ?? "TIMEOUT"}; failover immediately to '${nextModel}'`);
          continue;
        }

        // 3. Dynamic discovery safety net: if all predefined models failed with 404/503, query Google's live model list
        if (i === candidateModels.length - 1) {
          const liveModels = await discoverActiveGeminiModels(apiKey);
          const unattempted = liveModels.filter(m => !candidateModels.includes(m));
          if (unattempted.length > 0) {
            console.warn(`[LLM] Static models exhausted; dynamically discovered active models: ${unattempted.join(", ")}`);
            candidateModels = candidateModels.concat(unattempted);
            continue;
          }
        }
      }

      // For non-failover client errors (e.g. 401/403 invalid key, 402 billing), stop and surface
      break;
    }

    if (!response || !response.ok) {
      const status = response?.status ?? 502;
      const body = response ? await response.text() : lastErrorDetail;
      let detail = body;
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string } };
        detail = parsed.error?.message || body;
      } catch {
        // Keep upstream plain text
      }
      throw new Error(`Gemini API 오류 (${status}): ${sanitizeErrorDetail(detail)}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("") ?? "";
    return {
      id: crypto.randomUUID(),
      created: Date.now(),
      model: activeModel,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: text },
          finish_reason: data.candidates?.[0]?.finishReason ?? "stop",
        },
      ],
    };
  }

  const response = await fetchWithBackoff(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${resolveApiKey()}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    let errorText = body;
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      errorText = parsed.error?.message || body;
    } catch {
      // Keep upstream text
    }
    throw new Error(
      `AI API 오류 (${response.status}): ${sanitizeErrorDetail(errorText)}`
    );
  }

  return (await response.json()) as InvokeResult;
}

export type ModelInfo = {
  id: string;
  object: string;
  created: number;
  owned_by: string;
};

export type ModelsResponse = {
  object: string;
  data: ModelInfo[];
};

export async function listLLMModels(): Promise<ModelsResponse> {
  assertApiKey();

  const url =
    ENV.aiApiUrl && ENV.aiApiUrl.trim().length > 0
      ? `${ENV.aiApiUrl.replace(/\/$/, "")}/models`
      : ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
        ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/models`
        : "https://forge.manus.im/v1/models";

  const response = await fetchWithBackoff(url, {
    headers: { authorization: `Bearer ${resolveApiKey()}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `List LLM models failed: ${response.status} ${response.statusText} – ${sanitizeErrorDetail(errorText)}`
    );
  }

  return (await response.json()) as ModelsResponse;
}
