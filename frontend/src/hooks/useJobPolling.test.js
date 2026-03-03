import { describe, expect, it } from "vitest";
import { hasActiveJobs, isTerminalStatus } from "./useJobPolling";

describe("isTerminalStatus", () => {
  it("recognizes lower-case terminal statuses", () => {
    expect(isTerminalStatus("success")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
  });

  it("recognizes upper-case terminal statuses", () => {
    expect(isTerminalStatus("SUCCESS")).toBe(true);
    expect(isTerminalStatus("FAILURE")).toBe(true);
    expect(isTerminalStatus("REVOKED")).toBe(true);
  });

  it("treats running/queued as non-terminal", () => {
    expect(isTerminalStatus("queued")).toBe(false);
    expect(isTerminalStatus("running")).toBe(false);
  });
});

describe("hasActiveJobs", () => {
  it("returns true when at least one job is active", () => {
    expect(
      hasActiveJobs([
        { id: "1", status: "success" },
        { id: "2", status: "running" }
      ])
    ).toBe(true);
  });

  it("returns false when all jobs are terminal", () => {
    expect(
      hasActiveJobs([
        { id: "1", status: "success" },
        { id: "2", status: "FAILED" }
      ])
    ).toBe(false);
  });

  it("returns false for empty lists", () => {
    expect(hasActiveJobs([])).toBe(false);
  });
});
