// Shared HTTP helper utilities for backend functions.
// Keeps response headers and error logging consistent across handlers.

export function statusOf(error) {
  return error?.status ?? error?.response?.status;
}

export function json(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

export function safeErrorDetails(error) {
  return {
    status: statusOf(error) ?? null,
    name: typeof error?.name === "string" ? error.name.slice(0, 80) : "Error"
  };
}