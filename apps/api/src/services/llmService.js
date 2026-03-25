import { config } from "../config.js";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const REQUEST_TIMEOUT_MS = 15000;
const MIN_REQUEST_GAP_MS = 3000;
const FALLBACK_DELAY_MS = 8000;
let lastCallTime = 0;

function hasGeminiConfig() {
  return Boolean(config.geminiApiKey);
}

function hasGroqConfig() {
  return Boolean(config.groqApiKey);
}

function hasOpenRouterConfig() {
  return Boolean(config.openrouterApiKey);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rateLimit() {
  const now = Date.now();
  const waitMs = Math.max(0, MIN_REQUEST_GAP_MS - (now - lastCallTime));
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  lastCallTime = Date.now();
}

function extractRetryDelayMs(message) {
  const text = String(message || "");

  const geminiMatch = text.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
  if (geminiMatch) {
    return Number(geminiMatch[1]) * 1000;
  }

  const groqMatch = text.match(/Please try again in\s+([\d.]+)s/i);
  if (groqMatch) {
    return Math.ceil(Number(groqMatch[1]) * 1000);
  }

  const openRouterMatch = text.match(/retry after\s+([\d.]+)\s*seconds?/i);
  if (openRouterMatch) {
    return Math.ceil(Number(openRouterMatch[1]) * 1000);
  }

  return 0;
}

async function geminiFetch(model, method, body) {
  await rateLimit();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `${GEMINI_BASE_URL}/models/${model}:${method}?key=${encodeURIComponent(
      config.geminiApiKey,
    )}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini request failed (${response.status}): ${errorText}`);
    }

    return response;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        `Gemini request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function groqFetch(path, body) {
  await rateLimit();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${GROQ_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.groqApiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq request failed (${response.status}): ${errorText}`);
    }

    return response;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        `Groq request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function openRouterFetch(path, body) {
  await rateLimit();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.openrouterApiKey}`,
        "HTTP-Referer": config.openrouterSiteUrl,
        "X-Title": config.openrouterAppName,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenRouter request failed (${response.status}): ${errorText}`,
      );
    }

    return response;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        `OpenRouter request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildGeminiRequestBody({
  systemPrompt,
  userPrompt,
  temperature,
  jsonSchema,
}) {
  const body = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      temperature,
    },
  };

  if (jsonSchema) {
    body.generationConfig.responseMimeType = "application/json";
    body.generationConfig.responseJsonSchema = jsonSchema;
  }

  return body;
}

function extractGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts.map((part) => part.text || "").join("").trim();
}

async function tryGeminiJson({
  systemPrompt,
  userPrompt,
  temperature,
  model,
  jsonSchema,
}) {
  const response = await geminiFetch(
    model,
    "generateContent",
    buildGeminiRequestBody({
      systemPrompt,
      userPrompt,
      temperature,
      jsonSchema,
    }),
  );

  const payload = await response.json();
  const content = extractGeminiText(payload);
  if (!content) {
    throw new Error("Gemini completion did not return content");
  }
  return JSON.parse(content);
}

async function tryGeminiText({
  systemPrompt,
  userPrompt,
  temperature,
  model,
}) {
  const response = await geminiFetch(
    model,
    "generateContent",
    buildGeminiRequestBody({
      systemPrompt,
      userPrompt,
      temperature,
    }),
  );

  const payload = await response.json();
  return extractGeminiText(payload);
}

async function tryGroqJson({
  systemPrompt,
  userPrompt,
  temperature,
  model,
}) {
  const response = await groqFetch("/chat/completions", {
    model,
    temperature,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `${userPrompt}\n\nReturn only valid JSON.` },
    ],
    response_format: {
      type: "json_object",
    },
  });

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Groq JSON completion did not return content");
  }
  return JSON.parse(content);
}

async function tryGroqText({
  systemPrompt,
  userPrompt,
  temperature,
  model,
}) {
  const response = await groqFetch("/chat/completions", {
    model,
    temperature,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const payload = await response.json();
  return payload.choices?.[0]?.message?.content || "";
}

async function tryOpenRouterJson({
  systemPrompt,
  userPrompt,
  temperature,
  model,
}) {
  const response = await openRouterFetch("/chat/completions", {
    model,
    temperature,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `${userPrompt}\n\nReturn only valid JSON.` },
    ],
    response_format: {
      type: "json_object",
    },
  });

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter JSON completion did not return content");
  }
  return JSON.parse(content);
}

async function tryOpenRouterText({
  systemPrompt,
  userPrompt,
  temperature,
  model,
}) {
  const response = await openRouterFetch("/chat/completions", {
    model,
    temperature,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const payload = await response.json();
  return payload.choices?.[0]?.message?.content || "";
}

async function withFallbackChain(providers) {
  const availableProviders = providers.filter(Boolean);
  if (!availableProviders.length) {
    throw new Error("No LLM provider is configured.");
  }

  const errors = [];

  for (let index = 0; index < availableProviders.length; index += 1) {
    const provider = availableProviders[index];

    if (index > 0) {
      const previousError = errors[errors.length - 1];
      const retryDelayMs = extractRetryDelayMs(previousError?.message);
      await sleep(Math.max(FALLBACK_DELAY_MS, retryDelayMs));
    }

    try {
      return await provider.run();
    } catch (error) {
      errors.push(error);
      if (index < availableProviders.length - 1) {
        console.warn(
          `${provider.label} LLM provider failed, attempting fallback:`,
          error.message,
        );
      }
    }
  }

  throw new Error(
    errors
      .map((error, index) => {
        const label =
          index === 0
            ? "Primary provider failed"
            : index === 1
              ? "Fallback provider failed"
              : `Fallback provider ${index} failed`;
        return `${label}: ${error.message}`;
      })
      .join("\n"),
  );
}

function ensureAtLeastOneProvider() {
  if (!hasGeminiConfig() && !hasGroqConfig() && !hasOpenRouterConfig()) {
    throw new Error(
      "At least one LLM provider must be configured. Set GEMINI_API_KEY, GROQ_API_KEY, or OPENROUTER_API_KEY.",
    );
  }
}

export async function createStructuredChatCompletion({
  systemPrompt,
  userPrompt,
  jsonSchema,
  temperature = 0.1,
  model = config.geminiModel,
}) {
  ensureAtLeastOneProvider();
  return withFallbackChain([
    hasGeminiConfig()
      ? {
          label: "Gemini",
          run: () =>
            tryGeminiJson({
              systemPrompt,
              userPrompt,
              temperature,
              model,
              jsonSchema,
            }),
        }
      : null,
    hasGroqConfig()
      ? {
          label: "Groq",
          run: () =>
            tryGroqJson({
              systemPrompt,
              userPrompt,
              temperature,
              model: config.groqModel,
            }),
        }
      : null,
    hasOpenRouterConfig()
      ? {
          label: "OpenRouter",
          run: () =>
            tryOpenRouterJson({
              systemPrompt,
              userPrompt,
              temperature,
              model: config.openrouterModel,
            }),
        }
      : null,
  ]);
}

export async function createJsonObjectChatCompletion({
  systemPrompt,
  userPrompt,
  temperature = 0.1,
  model = config.geminiModel,
}) {
  ensureAtLeastOneProvider();
  return withFallbackChain([
    hasGeminiConfig()
      ? {
          label: "Gemini",
          run: () =>
            tryGeminiJson({
              systemPrompt,
              userPrompt,
              temperature,
              model,
              jsonSchema: { type: "object" },
            }),
        }
      : null,
    hasGroqConfig()
      ? {
          label: "Groq",
          run: () =>
            tryGroqJson({
              systemPrompt,
              userPrompt,
              temperature,
              model: config.groqModel,
            }),
        }
      : null,
    hasOpenRouterConfig()
      ? {
          label: "OpenRouter",
          run: () =>
            tryOpenRouterJson({
              systemPrompt,
              userPrompt,
              temperature,
              model: config.openrouterModel,
            }),
        }
      : null,
  ]);
}

export async function createChatCompletion({
  systemPrompt,
  userPrompt,
  temperature = 0.2,
  model = config.geminiModel,
}) {
  ensureAtLeastOneProvider();
  return withFallbackChain([
    hasGeminiConfig()
      ? {
          label: "Gemini",
          run: () =>
            tryGeminiText({
              systemPrompt,
              userPrompt,
              temperature,
              model,
            }),
        }
      : null,
    hasGroqConfig()
      ? {
          label: "Groq",
          run: () =>
            tryGroqText({
              systemPrompt,
              userPrompt,
              temperature,
              model: config.groqModel,
            }),
        }
      : null,
    hasOpenRouterConfig()
      ? {
          label: "OpenRouter",
          run: () =>
            tryOpenRouterText({
              systemPrompt,
              userPrompt,
              temperature,
              model: config.openrouterModel,
            }),
        }
      : null,
  ]);
}

export async function streamChatCompletion({
  systemPrompt,
  userPrompt,
  onToken,
  temperature = 0.2,
  model = config.geminiModel,
}) {
  const text = await createChatCompletion({
    systemPrompt,
    userPrompt,
    temperature,
    model,
  });

  if (text) {
    onToken(text);
  }
}
