export const OWNER_STORAGE_KEY = "shithub.owner";
const DEFAULT_OWNER = "honey";

export function getStoredOwner() {
  const value = window.localStorage.getItem(OWNER_STORAGE_KEY);
  if (!value || !value.trim()) {
    return DEFAULT_OWNER;
  }
  return value.trim();
}

export function setStoredOwner(owner) {
  window.localStorage.setItem(OWNER_STORAGE_KEY, owner.trim());
}
