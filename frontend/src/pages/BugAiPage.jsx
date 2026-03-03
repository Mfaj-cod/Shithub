import { useEffect, useMemo, useState } from "react";
import { askBugAi, listRepos } from "../api/client";
import ShithubIcon from "../components/ShithubIcon";
import { getAuthUser } from "../utils/authStorage";

const MAX_HISTORY_ITEMS = 12;

function BugAiPage() {
  const authUser = getAuthUser();
  const owner = authUser?.username || "";
  const storageKey = useMemo(() => (owner ? `bugai.session.${owner}` : "bugai.session"), [owner]);

  const [repos, setRepos] = useState([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState("");
  const [selectedRepo, setSelectedRepo] = useState("");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!owner) {
      return;
    }

    let cancelled = false;
    const loadRepos = async () => {
      setReposLoading(true);
      setReposError("");
      try {
        const data = await listRepos(owner);
        if (!cancelled) {
          setRepos(data);
        }
      } catch (err) {
        if (!cancelled) {
          setRepos([]);
          setReposError(err?.message || "Unable to load repositories.");
        }
      } finally {
        if (!cancelled) {
          setReposLoading(false);
        }
      }
    };

    loadRepos();
    return () => {
      cancelled = true;
    };
  }, [owner]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setMessages([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setMessages([]);
        return;
      }

      const normalized = parsed
        .filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
        .slice(-MAX_HISTORY_ITEMS * 2);
      setMessages(normalized);
    } catch {
      setMessages([]);
    }
  }, [storageKey]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(messages));
  }, [messages, storageKey]);

  const handleClearConversation = () => {
    setMessages([]);
    setError("");
    window.localStorage.removeItem(storageKey);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      setError("Prompt is required.");
      return;
    }

    const userMessage = { role: "user", content: cleanPrompt };
    const nextMessages = [...messages, userMessage];
    const trimmedHistory = nextMessages.slice(-MAX_HISTORY_ITEMS).map((item) => ({
      role: item.role,
      content: item.content
    }));

    setMessages(nextMessages);
    setPrompt("");
    setError("");
    setSubmitting(true);

    try {
      const data = await askBugAi({
        prompt: cleanPrompt,
        history: trimmedHistory,
        owner: selectedRepo ? owner : null,
        repo: selectedRepo || null
      });

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
          model: data.model,
          contextRepo: data.context_repo || null
        }
      ]);
    } catch (err) {
      setError(err?.message || "bugAI request failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="inline-flex items-center gap-2 text-3xl font-semibold text-gh-text">
          <ShithubIcon className="h-5 w-5" />
          <span>bugAI</span>
        </h1>
        <span className="rounded-full border border-gh-border bg-gh-panel px-3 py-1 text-xs text-gh-muted">Model: llama-3.3-70b-versatile</span>
      </div>

      <p className="text-sm text-gh-muted">
        Ask any coding question. Optionally select a repository for context-aware answers.
      </p>

      <div className="rounded-md border border-gh-border bg-gh-panel p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="text-sm text-gh-muted" htmlFor="bugai-repo-context">
            Repository context
          </label>
          <select
            id="bugai-repo-context"
            value={selectedRepo}
            onChange={(event) => setSelectedRepo(event.target.value)}
            className="rounded-md border border-gh-border bg-gh-bg px-3 py-2 text-sm text-gh-text outline-none ring-gh-accent focus:ring-1"
          >
            <option value="">No repository context</option>
            {repos.map((repo) => (
              <option key={repo.name} value={repo.name}>
                {repo.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleClearConversation}
            className="gh-btn ml-auto rounded-md px-3 py-2 text-sm font-semibold"
          >
            Clear conversation
          </button>
        </div>

        {reposLoading ? <p className="mb-3 text-xs text-gh-muted">Loading repositories...</p> : null}
        {reposError ? <p className="mb-3 rounded-md border border-gh-danger/40 bg-gh-danger/10 p-2 text-sm text-gh-danger">{reposError}</p> : null}
        {error ? <p className="mb-3 rounded-md border border-gh-danger/40 bg-gh-danger/10 p-2 text-sm text-gh-danger">{error}</p> : null}

        <div className="max-h-[52vh] space-y-3 overflow-y-auto rounded-md border border-gh-border bg-gh-bg p-3">
          {messages.length === 0 ? (
            <p className="text-sm text-gh-muted">
              Start a conversation with bugAI. Ask for debugging help, code review suggestions, architecture choices, or implementation examples.
            </p>
          ) : (
            messages.map((message, index) => (
              <article
                key={`${message.role}-${index}-${message.content.length}`}
                className={`rounded-md border p-3 ${
                  message.role === "user"
                    ? "ml-8 border-gh-border bg-gh-panelAlt"
                    : "mr-8 border-[#1f6feb]/40 bg-[#1f6feb]/10"
                }`}
              >
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gh-muted">{message.role}</p>
                <p className="whitespace-pre-wrap break-words text-sm text-gh-text">{message.content}</p>
                {message.role === "assistant" && message.contextRepo ? (
                  <p className="mt-2 text-xs text-gh-muted">Context: {message.contextRepo}</p>
                ) : null}
              </article>
            ))
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <textarea
            rows={5}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask bugAI a coding question..."
            className="w-full rounded-md border border-gh-border bg-gh-bg px-3 py-2 text-sm text-gh-text outline-none ring-gh-accent focus:ring-1"
          />

          <div className="flex justify-end">
            <button type="submit" disabled={submitting} className="gh-btn-primary rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-60">
              {submitting ? "Thinking..." : "Ask bugAI"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

export default BugAiPage;
