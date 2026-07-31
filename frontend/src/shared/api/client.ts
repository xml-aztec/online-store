// SSR (Server Components) calls the backend directly over the Docker network;
// the browser can only reach it through Caddy at /api (see caddy/Caddyfile).
function getBaseUrl(): string {
  if (typeof window === "undefined") {
    return process.env.INTERNAL_API_URL ?? "http://api:8000/v1";
  }
  return "/api/v1";
}

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export class ApiError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Plain module state, not a React store: ТЗ 5.5 keeps the access token in
// frontend memory only (no localStorage), and apiFetch is a bare function
// used from both Server and Client Components, so it can't depend on a React
// hook. entities/auth/store.ts (the reactive, UI-facing state) calls
// setAccessToken() to keep this in sync whenever it changes.
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (accessToken && typeof window !== "undefined") {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorEnvelope | null;
    throw new ApiError(
      response.status,
      body?.error.code ?? "UNKNOWN_ERROR",
      body?.error.message ?? response.statusText,
      body?.error.details ?? {}
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

// Like apiFetch, but doesn't force a JSON Content-Type (needed for FormData
// uploads, where the browser must set its own multipart boundary) and hands
// back the raw Response so callers can read it as JSON or a Blob.
export async function apiFetchRaw(path: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (accessToken && typeof window !== "undefined") {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorEnvelope | null;
    throw new ApiError(
      response.status,
      body?.error.code ?? "UNKNOWN_ERROR",
      body?.error.message ?? response.statusText,
      body?.error.details ?? {}
    );
  }

  return response;
}
