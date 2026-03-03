"use client";

import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import {
  buildOpenAIMessages,
  createProxyFetchBridge,
  OFFLINE_MESSAGE,
} from "@/lib/chat-stream";

const MODEL_ID = "proxy-ing";

function getTextContent(message: {
  parts: Array<{ type: string; text?: string }>;
}) {
  return message.parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("")
    .trim();
}

export function ProxyChat() {
  const [hostname, setHostname] = useState("proxy.ing");
  const [username, setUsername] = useState("proxy");
  const [input, setInput] = useState("");
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);
  const [offlineError, setOfflineError] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentHostname = window.location.hostname || "proxy.ing";
    const extractedUsername = currentHostname.split(".")[0] || "proxy";

    setHostname(currentHostname);
    setUsername(extractedUsername);
    document.title = `${extractedUsername}.proxy.ing`;
  }, []);

  const transport = useMemo(
    () =>
      new TextStreamChatTransport({
        api: "/v1/chat/completions",
        fetch: createProxyFetchBridge(),
        prepareSendMessagesRequest: ({ body, messages, headers, credentials }) => ({
          body: {
            ...body,
            model: MODEL_ID,
            stream: true,
            messages: buildOpenAIMessages(messages),
          },
          headers,
          credentials,
        }),
      }),
    []
  );

  const { messages, sendMessage, status, stop } = useChat({
    transport,
    onError: () => {
      setOfflineError(OFFLINE_MESSAGE);
    },
  });

  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, status]);

  const isStreaming = status === "streaming" || status === "submitted";

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmed = input.trim();
    if (!trimmed || isStreaming) {
      return;
    }

    setOfflineError(null);

    sendMessage({
      role: "user",
      parts: [{ type: "text", text: trimmed }],
    });

    setInput("");
  };

  return (
    <main className="chat-shell">
      {!isBannerDismissed && (
        <div className="privacy-banner">
          <span>
            This is someone&apos;s personal AI endpoint. Don&apos;t share sensitive
            information.
          </span>
          <button
            className="banner-dismiss"
            onClick={() => setIsBannerDismissed(true)}
            type="button"
          >
            Dismiss
          </button>
        </div>
      )}

      <header className="chat-header">
        <h1 className="chat-title">Talking to {username}</h1>
        <p className="chat-subtitle">{hostname}</p>
      </header>

      <section className="chat-messages" ref={messagesRef}>
        {messages.length === 0 && (
          <p className="empty-state">
            Say hello to start a new stateless conversation.
          </p>
        )}

        {messages.map((message) => {
          const content = getTextContent(message);
          if (!content) {
            return null;
          }

          const roleClass = message.role === "user" ? "user" : "assistant";

          return (
            <article className={`message ${roleClass}`} key={message.id}>
              <div className={`bubble ${roleClass}`}>
                <Streamdown>{content}</Streamdown>
              </div>
            </article>
          );
        })}
      </section>

      {offlineError && <p className="offline-message">{offlineError}</p>}

      <form className="chat-form" onSubmit={handleSubmit}>
        <textarea
          className="chat-input"
          disabled={isStreaming}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              const form = event.currentTarget.form;
              if (form) {
                form.requestSubmit();
              }
            }
          }}
          placeholder={`Message ${username}...`}
          value={input}
        />

        <div className="chat-actions">
          <button
            className="button"
            disabled={!isStreaming}
            onClick={() => stop()}
            type="button"
          >
            Stop
          </button>
          <button
            className="button primary"
            disabled={!input.trim() || isStreaming}
            type="submit"
          >
            Send
          </button>
        </div>
      </form>

      <footer className="chat-footer">
        powered by{" "}
        <a href="https://theproxycompany.com" rel="noreferrer" target="_blank">
          proxy.ing
        </a>
      </footer>
    </main>
  );
}
