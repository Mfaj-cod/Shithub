import { useEffect, useId, useRef, useState } from "react";
import ShithubIcon from "./ShithubIcon";

function BuildWithAiDialog({
  isOpen,
  owner,
  repoOptions,
  defaultRepo,
  loadingRepos,
  submitting,
  error,
  info,
  onClose,
  onSubmit
}) {
  const datalistId = useId();
  const wasOpenRef = useRef(false);
  const [repoName, setRepoName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    const justOpened = isOpen && !wasOpenRef.current;

    if (justOpened) {
      const fallbackRepo = defaultRepo || repoOptions?.[0]?.name || "";
      setRepoName(fallbackRepo);
      setPrompt("");
      setValidationError("");
    }

    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }

    wasOpenRef.current = true;
  }, [defaultRepo, isOpen, repoOptions]);

  if (!isOpen) {
    return null;
  }

  const normalizedError =
    typeof error === "string" && error.toLowerCase().includes("invalid authentication token")
      ? "Session expired. Please sign in again."
      : error;

  const handleSubmit = async (event) => {
    event.preventDefault();
    const cleanRepo = repoName.trim();
    const cleanPrompt = prompt.trim();

    if (!cleanRepo) {
      setValidationError("Repository is required.");
      return;
    }
    if (!cleanPrompt) {
      setValidationError("Build instruction is required.");
      return;
    }

    setValidationError("");
    await onSubmit(cleanRepo, cleanPrompt);
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/70 p-4">
      <div className="flex min-h-full items-center justify-center py-2">
        <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col rounded-md border border-gh-border bg-gh-panel shadow-2xl">
          <div className="flex items-center justify-between border-b border-gh-border px-4 py-3">
            <h2 className="inline-flex items-center gap-1.5 text-lg font-semibold text-gh-text">
              {/* <ShithubIcon className="h-4 w-4" /> */}
              <span>Build sh*t</span>
            </h2>
            <button type="button" onClick={onClose} className="gh-btn rounded-md px-2 py-1 text-xs font-semibold">
              Close
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gh-muted">Owner</label>
                <input
                  value={owner}
                  readOnly
                  className="w-full rounded-md border border-gh-border bg-gh-bg px-3 py-2 text-sm text-gh-muted"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gh-muted">Repository</label>
                <input
                  list={datalistId}
                  value={repoName}
                  onChange={(event) => setRepoName(event.target.value)}
                  placeholder={loadingRepos ? "Loading repositories..." : "repo-name"}
                  className="w-full rounded-md border border-gh-border bg-gh-bg px-3 py-2 text-sm text-gh-text outline-none ring-gh-accent focus:ring-1"
                />
                <datalist id={datalistId}>
                  {repoOptions.map((repo) => (
                    <option key={repo.name} value={repo.name} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gh-muted">Instruction</label>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={8}
                  placeholder="Example: Add a FastAPI endpoint /health and tests for it."
                  className="w-full rounded-md border border-gh-border bg-gh-bg px-3 py-2 text-sm text-gh-text outline-none ring-gh-accent focus:ring-1"
                />
              </div>

              {validationError ? <p className="rounded-md border border-gh-danger/40 bg-gh-danger/10 p-2 text-sm text-gh-danger">{validationError}</p> : null}
              {normalizedError ? <p className="rounded-md border border-gh-danger/40 bg-gh-danger/10 p-2 text-sm text-gh-danger">{normalizedError}</p> : null}
              {info ? <p className="rounded-md border border-gh-success/40 bg-gh-success/10 p-2 text-sm text-[#7ee787]">{info}</p> : null}
            </div>

            <div className="border-t border-gh-border bg-gh-panel px-4 py-3">
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={onClose} className="gh-btn rounded-md px-3 py-2 text-sm font-semibold">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="gh-btn-primary rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-70">
                  {submitting ? (
                    "Queueing..."
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      {/* <ShithubIcon className="h-3.5 w-3.5" /> */}
                      <span>Build sh*t</span>
                    </span>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default BuildWithAiDialog;
