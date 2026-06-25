import { useSessionStore } from "@/stores/sessionStore";

const BASE_URL = import.meta.env.VITE_API_URL;

export class ApiError extends Error {
  code: number;
  detail: string | null;

  constructor(code: number, message: string, detail: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.detail = detail;
  }
}

// All backend responses are wrapped: {"ok":true,"data":{...}} or {"ok":false,"error":"..."}
// Unwrap the data field when ok=true, otherwise return as-is.
function unwrap<T>(json: unknown): T {
  if (
    json !== null &&
    typeof json === "object" &&
    "ok" in json &&
    (json as Record<string, unknown>).ok === true &&
    "data" in json
  ) {
    return (json as { ok: boolean; data: T }).data;
  }
  return json as T;
}

function pickErrorMessage(body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const msg = b.error ?? b.message ?? b.detail;
    if (typeof msg === "string") return msg;
  }
  return "Request failed";
}

async function refreshToken(): Promise<void> {
  const store = useSessionStore.getState();
  const { refresh_token } = store;

  if (!refresh_token) {
    store.clearSession();
    throw new ApiError(401, "No refresh token available");
  }

  const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: refresh_token }),
  });

  if (!res.ok) {
    store.clearSession();
    throw new ApiError(401, "Session expired. Please log in again.");
  }

  const json = (await res.json()) as {
    ok: boolean;
    data?: { accessToken: string; refreshToken?: string };
  };

  if (!json.ok || !json.data?.accessToken) {
    store.clearSession();
    throw new ApiError(401, "Failed to refresh session.");
  }

  store.setSession({
    access_token: json.data.accessToken,
    refresh_token: json.data.refreshToken ?? refresh_token,
    user_id: store.user_id ?? "",
    phone: store.phone ?? "",
    display_name: store.display_name,
    wallet_address: store.wallet_address,
  });
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { access_token } = useSessionStore.getState();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(access_token ? { Authorization: `Bearer ${access_token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401 && access_token) {
    await refreshToken();
    const retryToken = useSessionStore.getState().access_token;
    const retryHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(retryToken ? { Authorization: `Bearer ${retryToken}` } : {}),
    };
    const retryRes = await fetch(`${BASE_URL}${path}`, { ...options, headers: retryHeaders });
    if (!retryRes.ok) {
      const body = await retryRes.json().catch(() => ({}));
      throw new ApiError(retryRes.status, pickErrorMessage(body), null);
    }
    return unwrap<T>(await retryRes.json());
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, pickErrorMessage(body), null);
  }

  return unwrap<T>(await res.json());
}

export const apiClient = {
  get<T>(path: string): Promise<T> {
    return request<T>(path, { method: "GET" });
  },

  post<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, { method: "POST", body: JSON.stringify(body) });
  },

  put<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, { method: "PUT", body: JSON.stringify(body) });
  },

  delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: "DELETE" });
  },
};
