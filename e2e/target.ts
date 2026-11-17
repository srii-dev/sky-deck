/** True when the tests run against a production build (the local Worker, or a live site marked with E2E_PRODUCTION=1). */
export const isProduction =
  process.env.E2E_TARGET === "worker" ||
  (!!process.env.E2E_BASE_URL && process.env.E2E_PRODUCTION === "1");
