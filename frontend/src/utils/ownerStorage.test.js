import { describe, expect, it } from "vitest";
import { getStoredOwner, OWNER_STORAGE_KEY, setStoredOwner } from "./ownerStorage";

describe("ownerStorage", () => {
  it("returns default owner when localStorage is empty", () => {
    expect(getStoredOwner()).toBe("honey");
  });

  it("persists and restores owner", () => {
    setStoredOwner("octocat");
    expect(window.localStorage.getItem(OWNER_STORAGE_KEY)).toBe("octocat");
    expect(getStoredOwner()).toBe("octocat");
  });
});
