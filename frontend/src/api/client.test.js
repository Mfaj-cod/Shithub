import { describe, expect, it } from "vitest";
import { DEFAULT_API_BASE_URL, resolveApiBaseUrl } from "./client";

describe("resolveApiBaseUrl", () => {
  it("uses default url when env value is missing", () => {
    expect(resolveApiBaseUrl(undefined)).toBe(DEFAULT_API_BASE_URL);
  });

  it("uses default url when env value is blank", () => {
    expect(resolveApiBaseUrl("   ")).toBe(DEFAULT_API_BASE_URL);
  });

  it("uses trimmed env value when provided", () => {
    expect(resolveApiBaseUrl(" http://localhost:9000 ")).toBe("http://localhost:9000");
  });
});
