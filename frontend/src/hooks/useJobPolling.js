import { useEffect } from "react";

export const POLL_INTERVAL_MS = 4000;
export const TERMINAL_STATUSES = new Set(["success", "failed", "SUCCESS", "FAILURE", "REVOKED"]);

export function isTerminalStatus(status) {
  if (!status) {
    return false;
  }
  return TERMINAL_STATUSES.has(status) || TERMINAL_STATUSES.has(String(status).toLowerCase());
}

export function hasActiveJobs(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return false;
  }
  return jobs.some((job) => !isTerminalStatus(job?.status));
}

export function useJobPolling({ enabled, fetchJobs, onJobs, intervalMs = POLL_INTERVAL_MS }) {
  useEffect(() => {
    if (!enabled || typeof fetchJobs !== "function" || typeof onJobs !== "function") {
      return;
    }

    let isCancelled = false;
    let timeoutId = null;

    const poll = async () => {
      try {
        const nextJobs = await fetchJobs();
        if (isCancelled) {
          return;
        }

        onJobs(nextJobs);

        if (hasActiveJobs(nextJobs)) {
          timeoutId = window.setTimeout(poll, intervalMs);
        }
      } catch {
        if (isCancelled) {
          return;
        }
        timeoutId = window.setTimeout(poll, intervalMs);
      }
    };

    poll();

    return () => {
      isCancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [enabled, fetchJobs, onJobs, intervalMs]);
}
