import "./lib/error-capture";

import { consumeLastCapturedError, isClientDisconnect } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  httpsRedirectTarget,
  securityOptionsFromEnv,
  withSecurityHeaders,
} from "./lib/security-headers";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  const captured = consumeLastCapturedError();
  // A request the browser dropped was already logged as one line; nobody is left to read this response.
  if (!isClientDisconnect(captured)) {
    console.error(captured ?? new Error(`h3 swallowed SSR error: ${body}`));
  }
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const httpsUrl = httpsRedirectTarget(request.url, (n) => request.headers.get(n));
    // 308 keeps a POST a POST (a 301 would turn a server-function call into a GET); GET and HEAD use 301.
    if (httpsUrl) {
      const keepMethod = request.method !== "GET" && request.method !== "HEAD";
      return withSecurityHeaders(Response.redirect(httpsUrl, keepMethod ? 308 : 301));
    }
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(
        await normalizeCatastrophicSsrResponse(response),
        securityOptionsFromEnv(process.env),
      );
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
        securityOptionsFromEnv(process.env),
      );
    }
  },
};
