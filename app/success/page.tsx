"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type TunnelCredentials = {
  username: string;
  tunnel_token: string;
  instructions: string;
};

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [credentials, setCredentials] = useState<TunnelCredentials | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setError("Missing session ID.");
      setLoading(false);
      return;
    }

    fetch("https://api.theproxycompany.com/v1/tunnels/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to retrieve credentials.");
        setCredentials(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const copyToken = () => {
    if (!credentials) return;
    navigator.clipboard.writeText(credentials.tunnel_token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="success-content">
      {loading && <p className="success-status">Retrieving your credentials...</p>}

      {error && (
        <div className="success-card error">
          <p>{error}</p>
        </div>
      )}

      {credentials && (
        <>
          <div className="success-card">
            <h2 className="success-subdomain">{credentials.username}.proxy.ing</h2>
            <p className="success-congrats">Your subdomain is live.</p>
          </div>

          <div className="success-card">
            <h3 className="success-label">Quick Start</h3>
            <div className="success-code">
              <code>brew install cloudflared</code>
            </div>
            <div className="success-code">
              <code>cloudflared tunnel run --token {credentials.tunnel_token}</code>
            </div>
            <button className="success-copy" onClick={copyToken} type="button">
              {copied ? "Copied" : "Copy Token"}
            </button>
          </div>

          <div className="success-card">
            <h3 className="success-label">Using Eden?</h3>
            <p className="success-hint">
              Open the proxy.ing tab in Settings and paste your token.
            </p>
          </div>
        </>
      )}
    </section>
  );
}

export default function SuccessPage() {
  return (
    <main className="success-shell">
      <header className="success-header">
        <h1 className="success-title">proxy.ing</h1>
      </header>

      <Suspense fallback={<p className="success-status">Loading...</p>}>
        <SuccessContent />
      </Suspense>

      <footer className="success-footer">
        powered by{" "}
        <a href="https://theproxycompany.com" rel="noreferrer" target="_blank">
          proxy.ing
        </a>
      </footer>
    </main>
  );
}
