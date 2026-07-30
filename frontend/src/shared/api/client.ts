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

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
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
