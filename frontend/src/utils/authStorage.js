const AUTH_TOKEN_KEY = "shithub.auth.token";
const AUTH_USER_KEY = "shithub.auth.user";
export const AUTH_USER_CHANGED_EVENT = "shithub:auth-user-changed";

function emitAuthUserChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_USER_CHANGED_EVENT));
  }
}

export function getAuthToken() {
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token) {
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken() {
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
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
