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
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  model?: string;
  thinking?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
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
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
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

export function toGeminiContents(messages: Message[]) {
  return messages.filter(message => message.role !== "system").map(message => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: ensureArray(message.content).map(part => {
      if (typeof part === "string") return { text: part };
      if (part.type === "text") return { text: part.text };
      if (part.type === "image_url") {
        const match = part.image_url.url.match(/^data:([^;]+);base64,([\s\S]+)$/);
        if (!match) {
          throw new Error("이미지 파일은 base64 data URL 형식으로 전달되어야 합니다.");
        }
        return { inlineData: { mimeType: match[1], data: match[2].replace(/\s+/g, "") } };
      }
      if (part.type === "file_url") {
        const match = part.file_url.url.match(/^data:([^;]+);base64,([\s\S]+)$/);
        if (!match) {
          throw new Error("문서 파일은 base64 data URL 형식으로 전달되어야 합니다.");
        }
        return { inlineData: { mimeType: match[1], data: match[2].replace(/\s+/g, "") } };
      }
      return { text: "" };
    }),
  }));
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
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
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
  init: FetchInit
): Promise<Response> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        ...init,
        signal: init.signal ?? controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok || !isRetryableStatus(response.status) || attempt === RETRY_MAX_RETRIES) {
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
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after status ${response.status}`
      );
      await sleep(computeBackoffDelay(attempt, retryAfterMs));
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      if (attempt === RETRY_MAX_RETRIES) throw error;
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after network error`
      );
      await sleep(computeBackoffDelay(attempt));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("AI 서버 응답 시간이 초과되었거나 연결에 실패했습니다.");
};

const GEMINI_FALLBACK_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash",
] as const;

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
    const system = messages.find(message => message.role === "system");
    const geminiPayload = {
      systemInstruction: system ? {
        parts: [{ text: ensureArray(system.content).map(part => typeof part === "string" ? part : part.type === "text" ? part.text : "").join("\n") }],
      } : undefined,
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
    const googleBase = (ENV.aiApiUrl || "https://generativelanguage.googleapis.com/v1beta/models").replace(/\/$/, "");
    const primaryModel = model || ENV.aiModel || "gemini-2.5-flash";
    const candidateModels = Array.from(new Set([primaryModel, ...GEMINI_FALLBACK_MODELS]));

    let response: Response | null = null;
    let activeModel = primaryModel;

    for (let i = 0; i < candidateModels.length; i++) {
      activeModel = candidateModels[i];
      const endpoint = `${googleBase}/${activeModel}:generateContent?key=${encodeURIComponent(resolveApiKey())}`;
      response = await fetchWithBackoff(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(geminiPayload),
      });
      // Only try fallback model when the requested model ID is not found (404)
      if (response.status !== 404 || i === candidateModels.length - 1) {
        break;
      }
      try {
        await response.body?.cancel();
      } catch {
        // ignore
      }
      console.warn(`[LLM] Gemini model '${activeModel}' returned 404; falling back to '${candidateModels[i + 1]}'`);
    }

    if (!response || !response.ok) {
      const status = response?.status ?? 502;
      const body = response ? await response.text() : "";
      let detail = body;
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string } };
        detail = parsed.error?.message || body;
      } catch {
        // Keep upstream plain text
      }
      throw new Error(`Gemini API 오류 (${status}): ${sanitizeErrorDetail(detail)}`);
    }

    const data = await response.json() as {
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
      choices: [{
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: data.candidates?.[0]?.finishReason ?? "stop",
      }],
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

  const url = ENV.aiApiUrl && ENV.aiApiUrl.trim().length > 0
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
