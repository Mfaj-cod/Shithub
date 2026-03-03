import { clearAuthSession, getAuthToken } from "../utils/authStorage";

const envApiBase =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_BACKEND_ORIGIN ||
  "";

export const DEFAULT_API_BASE_URL = import.meta.env.DEV ? "http://127.0.0.1:8000" : "/api";
export const AUTH_INVALID_EVENT = "shithub:auth-invalid";

export function resolveApiBaseUrl(envValue) {
  const value = typeof envValue === "string" ? envValue.trim() : "";
  return value || DEFAULT_API_BASE_URL;
}

export const API_BASE_URL = resolveApiBaseUrl(envApiBase);

async function request(path, options = {}) {
  const { skipAuthInvalidEvent = false, ...fetchOptions } = options;
  const token = getAuthToken();
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
  const requestHeaders = {
    ...authHeader,
    ...(fetchOptions.headers || {})
  };
  const isFormDataPayload = typeof FormData !== "undefined" && fetchOptions.body instanceof FormData;
  const hasContentTypeHeader = Object.keys(requestHeaders).some((key) => key.toLowerCase() === "content-type");

  if (!isFormDataPayload && !hasContentTypeHeader) {
    requestHeaders["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: requestHeaders,
    ...fetchOptions
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    let detail = "";

    try {
      const data = await response.json();
      if (typeof data?.detail === "string") {
        message = data.detail;
        detail = data.detail;
      } else if (typeof data?.error === "string") {
        message = data.error;
        detail = data.error;
      }
    } catch {
      // Keep fallback message.
    }

    const authFailureDetail = (detail || message || "").toLowerCase();
    const tokenAuthFailure =
      response.status === 401 &&
      Boolean(token) &&
      (authFailureDetail.includes("invalid authentication token") ||
        authFailureDetail.includes("not authenticated") ||
        authFailureDetail.includes("user not found"));

    if (tokenAuthFailure) {
      clearAuthSession();
      if (!skipAuthInvalidEvent && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(AUTH_INVALID_EVENT));
      }
      message = "Session expired. Please sign in again.";
      detail = message;
    }

    const error = new Error(message);
    error.status = response.status;
    error.detail = detail || message;
    throw error;
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

export function listRepos(owner) {
  return request(`/repos/${encodeURIComponent(owner)}`);
}

export function createRepo(owner, name) {
  return request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, {
    method: "POST"
  });
}

export function deleteRepo(owner, name) {
  return request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, {
    method: "DELETE"
  });
}

export function triggerAiReadme(owner, name) {
  return request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/ai/readme`, {
    method: "POST"
  });
}

export function triggerAiBuild(owner, name, prompt) {
  return request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/ai/build`, {
    method: "POST",
    body: JSON.stringify({ prompt })
  });
}

export function askBugAi({ prompt, history = [], owner = null, repo = null }) {
  return request("/ai/bugai/ask", {
    method: "POST",
    body: JSON.stringify({ prompt, history, owner, repo })
  });
}

export function getRepoDashboard(owner, name) {
  return request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/dashboard`);
}

export function getRepoTree(owner, name, path = "") {
  const params = new URLSearchParams();
  if (path && path.trim()) {
    params.set("path", path.trim());
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/tree${suffix}`);
}

export function getRepoBlob(owner, name, path) {
  const params = new URLSearchParams();
  params.set("path", path);
  return request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/blob?${params.toString()}`);
}

export function listRepoJobs(owner, name) {
  return request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/jobs`);
}

export function getJobLogs(jobId) {
  return request(`/jobs/${encodeURIComponent(jobId)}/logs`);
}

export function registerStart(username, email, password) {
  return request("/auth/register/start", {
    method: "POST",
    body: JSON.stringify({ username, email, password })
  });
}

export function loginStart(email, password) {
  return request("/auth/login/start", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export function getMe(options = {}) {
  return request("/auth/me", options);
}

export function uploadMyAvatar(file) {
  const formData = new FormData();
  formData.append("file", file);

  return request("/auth/me/avatar", {
    method: "POST",
    body: formData
  });
}

export function removeMyAvatar() {
  return request("/auth/me/avatar", {
    method: "DELETE"
  });
}
