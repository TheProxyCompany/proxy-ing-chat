# proxy-ing-chat

Stateless chat frontend for `*.proxy.ing`.

- No auth, no database, no persistence.
- Refresh starts a new conversation.
- Browser calls same-origin API paths (`/v1/chat/completions`, fallback `/v1/responses`).
- Streaming markdown rendering via Vercel AI SDK + Streamdown.

## Local

```bash
npm install
npm run dev
npm run build
```

## Cloudflare Pages build

```bash
npm run cf:build
```

This produces `.vercel/output/static` for Pages deploy.

## Cloudflare deploy

```bash
export CLOUDFLARE_ACCOUNT_ID=<account-id>
export CLOUDFLARE_API_TOKEN=<token-with-pages-permissions>
npm run cf:deploy
```

The token must include Pages permissions (for example, `Account > Cloudflare Pages > Edit`).

## Wildcard routing model

`*.proxy.ing` requests can be routed through a Worker to split traffic:

- `Accept: text/html` -> Pages frontend
- `/v1/*` -> tunnel origin for that username
- `OPTIONS` -> CORS preflight response

Worker source: `cloudflare/wildcard-router-worker.ts`
Worker config: `cloudflare/wrangler.worker.toml`

Deploy worker:

```bash
npm run cf:deploy-router
```
