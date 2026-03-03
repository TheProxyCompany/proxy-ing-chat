import type { UIMessage } from "ai";

export const OFFLINE_MESSAGE = "This endpoint is currently offline.";

const FALLBACK_STATUSES = new Set([400, 404, 405, 415, 422]);

type OpenAIChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type EventExtractionResult = {
  delta?: string;
  done?: boolean;
  error?: string;
};

export function buildOpenAIMessages(messages: UIMessage[]): OpenAIChatMessage[] {
  return messages
    .map((message) => {
      const content = message.parts
        .filter(
          (part): part is { type: "text"; text: string } =>
            part.type === "text" && typeof part.text === "string"
        )
        .map((part) => part.text)
        .join("")
        .trim();

      if (!content) {
        return null;
      }

      const role = message.role === "assistant" ? "assistant" : "user";

      return {
        role,
        content,
      };
    })
    .filter((message): message is OpenAIChatMessage => message !== null);
}

function extractDelta(payload: unknown): EventExtractionResult {
  if (typeof payload !== "object" || payload === null) {
    return {};
  }

  const candidate = payload as {
    type?: unknown;
    error?: unknown;
    message?: unknown;
    delta?: unknown;
    choices?: Array<{
      text?: unknown;
      delta?: { content?: unknown };
    }>;
  };

  if (candidate.error) {
    if (typeof candidate.error === "string") {
      return { error: candidate.error };
    }

    if (
      typeof candidate.error === "object" &&
      candidate.error !== null &&
      "message" in candidate.error &&
      typeof (candidate.error as { message?: unknown }).message === "string"
    ) {
      return {
        error: (candidate.error as { message: string }).message,
      };
    }

    return { error: OFFLINE_MESSAGE };
  }

  if (typeof candidate.type === "string") {
    if (candidate.type === "response.output_text.delta") {
      if (typeof candidate.delta === "string") {
        return { delta: candidate.delta };
      }
    }

    if (candidate.type === "response.completed") {
      return { done: true };
    }

    if (
      candidate.type === "response.error" ||
      candidate.type === "response.failed"
    ) {
      if (typeof candidate.message === "string") {
        return { error: candidate.message };
      }
      return { error: OFFLINE_MESSAGE };
    }
  }

  const firstChoice = candidate.choices?.[0];
  if (firstChoice) {
    const deltaContent = firstChoice.delta?.content;

    if (typeof deltaContent === "string") {
      return { delta: deltaContent };
    }

    if (Array.isArray(deltaContent)) {
      const joined = deltaContent
        .map((entry) => {
          if (typeof entry === "string") {
            return entry;
          }

          if (
            typeof entry === "object" &&
            entry !== null &&
            "text" in entry &&
            typeof (entry as { text?: unknown }).text === "string"
          ) {
            return (entry as { text: string }).text;
          }

          return "";
        })
        .join("");

      if (joined) {
        return { delta: joined };
      }
    }

    if (typeof firstChoice.text === "string") {
      return { delta: firstChoice.text };
    }
  }

  return {};
}

function createTextStreamFromSSE(
  source: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";

      const processFrame = (frame: string) => {
        const lines = frame.split(/\r?\n/);
        const data = lines
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n")
          .trim();

        if (!data) {
          return;
        }

        if (data === "[DONE]") {
          controller.close();
          return;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          return;
        }

        const result = extractDelta(parsed);

        if (result.error) {
          controller.error(new Error(result.error));
          return;
        }

        if (result.done) {
          controller.close();
          return;
        }

        if (result.delta) {
          controller.enqueue(encoder.encode(result.delta));
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            buffer += decoder.decode();
            if (buffer.trim()) {
              processFrame(buffer);
            }
            controller.close();
            return;
          }

          buffer += decoder.decode(value, { stream: true });

          const frames = buffer.split(/\r?\n\r?\n/);
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            processFrame(frame);
          }
        }
      } catch {
        controller.error(new Error(OFFLINE_MESSAGE));
      } finally {
        reader.releaseLock();
      }
    },

    cancel() {
      reader.cancel().catch(() => {
        // Ignore cancellation noise from aborted requests.
      });
    },
  });
}

function toResponsesBody(body: Record<string, unknown>) {
  const { messages, ...rest } = body;

  return {
    ...rest,
    input: Array.isArray(messages) ? messages : [],
    stream: true,
  };
}

function isOfflineStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function createProxyFetchBridge(): (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response> {
  return async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");

    const rawBody = typeof init.body === "string" ? init.body : "{}";
    const parsedBody = JSON.parse(rawBody) as Record<string, unknown>;

    const doFetch = async (
      target: string | URL,
      body: Record<string, unknown>
    ) => {
      return fetch(target, {
        ...init,
        headers,
        body: JSON.stringify(body),
      });
    };

    let response: Response;

    try {
      const target =
        input instanceof Request ? new URL(input.url) : (input as string | URL);
      response = await doFetch(target, parsedBody);
    } catch {
      throw new Error(OFFLINE_MESSAGE);
    }

    if (!response.ok && FALLBACK_STATUSES.has(response.status)) {
      try {
        response = await doFetch("/v1/responses", toResponsesBody(parsedBody));
      } catch {
        throw new Error(OFFLINE_MESSAGE);
      }
    }

    if (!response.ok) {
      if (isOfflineStatus(response.status)) {
        throw new Error(OFFLINE_MESSAGE);
      }

      const errorText = await response.text();
      throw new Error(errorText || OFFLINE_MESSAGE);
    }

    if (!response.body) {
      throw new Error(OFFLINE_MESSAGE);
    }

    return new Response(createTextStreamFromSSE(response.body), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  };
}
