export interface Env {
  PAGES_ORIGIN: string;
}

function isHtmlRequest(request: Request): boolean {
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

function withCORS(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return withCORS(
        new Response(null, {
          status: 204,
        })
      );
    }

    const url = new URL(request.url);

    if (url.pathname.startsWith("/v1/")) {
      return withCORS(await fetch(request));
    }

    if (isHtmlRequest(request)) {
      const pagesURL = new URL(url);
      pagesURL.hostname = env.PAGES_ORIGIN;
      return fetch(new Request(pagesURL.toString(), request));
    }

    return withCORS(await fetch(request));
  },
};
