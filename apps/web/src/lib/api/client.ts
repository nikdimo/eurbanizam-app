import { ZodSchema } from "zod";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
const API_URL = API_BASE;

export type ApiResult<T> =
  | { data: T; error: null }
  | { data: null; error: string };

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const url =
    path.startsWith("http") || path.startsWith("/")
      ? path
      : `${API_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: init?.cache ?? "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        data: null,
        error:
          text || `Request failed with status ${res.status} ${res.statusText}`,
      };
    }

    const data = (await res.json()) as T;
    return { data, error: null };
  } catch (err) {
    console.error("API request error", err);
    return { data: null, error: "Network error. Please try again." };
  }
}

async function requestParsed<T>(
  path: string,
  schema: ZodSchema<T>,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const raw = await request<unknown>(path, init);
  if (raw.error || raw.data == null) {
    return { data: null, error: raw.error ?? "No data" };
  }

  const result = schema.safeParse(raw.data);
  if (!result.success) {
    console.error("Schema validation failed", result.error);
    return { data: null, error: "Unexpected response shape from server." };
  }

  return { data: result.data, error: null };
}

export const apiClient = {
  get: <T>(path: string, init?: RequestInit) => request<T>(path, init),
  post: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string, init?: RequestInit) =>
    request<T>(path, { ...init, method: "DELETE" }),
  getParsed: <T>(path: string, schema: ZodSchema<T>, init?: RequestInit) =>
    requestParsed<T>(path, schema, init),
};
