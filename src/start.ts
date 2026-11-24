import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { errorStatus, GENERIC_ERROR_MESSAGES } from "./lib/server-error";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    const status = errorStatus(error);
    // Only the kind of error is logged for a bad request (the text can echo what the caller sent).
    if (status === 400) console.warn("[request] rejected a malformed request");
    else console.error(error);
    if (status === 400) {
      return new Response(GENERIC_ERROR_MESSAGES[400], {
        status,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    return new Response(renderErrorPage(), {
      status,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
