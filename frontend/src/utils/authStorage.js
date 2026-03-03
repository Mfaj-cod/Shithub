const AUTH_TOKEN_KEY = "shithub.auth.token";
const AUTH_USER_KEY = "shithub.auth.user";
export const AUTH_USER_CHANGED_EVENT = "shithub:auth-user-changed";

function normalizeToken(rawToken) {
  if (typeof rawToken !== "string") {
    return null;
  }

  let token = rawToken.trim();

  if (token.toLowerCase().startsWith("bearer ")) {
    token = token.slice(7).trim();
  }

  if (
    (token.startsWith("\"") && token.endsWith("\"")) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }

  if (!token || token === "undefined" || token === "null") {
    return null;
  }

  return token;
}

function emitAuthUserChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_USER_CHANGED_EVENT));
  }
}

export function getAuthToken() {
  return normalizeToken(window.localStorage.getItem(AUTH_TOKEN_KEY));
}

export function setAuthToken(token) {
  const normalized = normalizeToken(token);
  if (!normalized) {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
  } else {
    window.localStorage.setItem(AUTH_TOKEN_KEY, normalized);
  }
  emitAuthUserChanged();
}

export function clearAuthToken() {
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  emitAuthUserChanged();
}

export function getAuthUser() {
  const raw = window.localStorage.getItem(AUTH_USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setAuthUser(user) {
  if (!user || typeof user !== "object" || typeof user.username !== "string" || !user.username.trim()) {
    window.localStorage.removeItem(AUTH_USER_KEY);
    emitAuthUserChanged();
    return;
  }

  window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  emitAuthUserChanged();
}

export function clearAuthUser() {
  window.localStorage.removeItem(AUTH_USER_KEY);
  emitAuthUserChanged();
}

export function clearAuthSession() {
  clearAuthToken();
  clearAuthUser();
}
