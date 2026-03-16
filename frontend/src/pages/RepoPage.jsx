import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import MonacoEditor, { loader as monacoLoader } from "@monaco-editor/react";
import {
  API_BASE_URL,
  askBugAi,
  getJobLogs,
  getRepoBlob,
  getRepoDashboard,
  getRepoTree,
  listRepoJobs,
  saveRepoBlob,
  triggerAiBuild,
  triggerAiReadme
} from "../api/client";
import BuildWithAiDialog from "../components/BuildWithAiDialog";
import EmptyStatePanel from "../components/EmptyStatePanel";
import JobLogsModal from "../components/JobLogsModal";
import JobsTable from "../components/JobsTable";
import ReadmePanel from "../components/ReadmePanel";
import RepoTabNav, { isValidRepoTab } from "../components/RepoTabNav";
import ShithubIcon from "../components/ShithubIcon";
import StatusPill from "../components/StatusPill";
import { hasActiveJobs, useJobPolling } from "../hooks/useJobPolling";
import { clearAuthSession, getAuthToken, getAuthUser } from "../utils/authStorage";

monacoLoader.config({
  paths: {
    vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.50.0/min/vs"
  }
});

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value < 10 && index > 0 ? 1 : 0)} ${units[index]}`;
}

const EXTENSION_LANGUAGE_MAP = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  py: "python",
  md: "markdown",
  html: "html",
  css: "css",
  scss: "scss",
  yml: "yaml",
  yaml: "yaml",
  sh: "shell",
  bash: "shell",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  txt: "plaintext"
};

function getLanguageForPath(path) {
  const parts = (path || "").split(".");
  if (parts.length < 2) {
    return "plaintext";
  }
  const ext = parts.pop().toLowerCase();
  return EXTENSION_LANGUAGE_MAP[ext] || "plaintext";
}

function RepoPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { owner = "", name = "", tab = "code" } = useParams();
  const decodedOwner = useMemo(() => decodeURIComponent(owner), [owner]);
  const decodedName = useMemo(() => decodeURIComponent(name), [name]);
  const treePath = searchParams.get("path") || "";
  const filePath = searchParams.get("file") || "";
  const buildRepoOptions = useMemo(() => [{ name: decodedName }], [decodedName]);
  const [dashboard, setDashboard] = useState(null);
  const [treeData, setTreeData] = useState({ path: "", entries: [] });
  const [blobData, setBlobData] = useState(null);
  const [readmeData, setReadmeData] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [treeLoading, setTreeLoading] = useState(true);
  const [blobLoading, setBlobLoading] = useState(false);
  const [readmeLoading, setReadmeLoading] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [copiedClone, setCopiedClone] = useState(false);
  const [isPollingEnabled, setIsPollingEnabled] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState("");
  const [logsData, setLogsData] = useState(null);
  const [buildDialogOpen, setBuildDialogOpen] = useState(false);
  const [buildSubmitting, setBuildSubmitting] = useState(false);
  const [buildError, setBuildError] = useState("");
  const editorRef = useRef(null);
  const [editorFiles, setEditorFiles] = useState({});
  const [editorOrder, setEditorOrder] = useState([]);
  const [activeEditorPath, setActiveEditorPath] = useState("");
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [editorInfo, setEditorInfo] = useState("");
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiResponse, setAiResponse] = useState("");

  const repoLabel = useMemo(() => `${decodedOwner}/${decodedName}`, [decodedOwner, decodedName]);
  const activeEditorFile = useMemo(() => (activeEditorPath ? editorFiles[activeEditorPath] : null), [activeEditorPath, editorFiles]);
  const cloneUrl = useMemo(
    () => `${API_BASE_URL}/repos/${encodeURIComponent(decodedOwner)}/${encodeURIComponent(decodedName)}.git`,
    [decodedOwner, decodedName]
  );
  const loginRedirectPath = useMemo(
    () => `/auth/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`,
    [location.pathname, location.search]
  );

  useEffect(() => {
    if (!isValidRepoTab(tab)) {
      navigate(`/repo/${encodeURIComponent(decodedOwner)}/${encodeURIComponent(decodedName)}/code`, { replace: true });
    }
  }, [decodedName, decodedOwner, navigate, tab]);

  useEffect(() => {
    const flashInfo = location.state?.flashInfo;
    if (!flashInfo) {
      return;
    }

    setInfo(flashInfo);
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.pathname, location.search, location.state, navigate]);

  const loadDashboard = useCallback(async () => {
    const data = await getRepoDashboard(decodedOwner, decodedName);
    setDashboard(data);
    return data;
  }, [decodedOwner, decodedName]);

  const loadTree = useCallback(async () => {
    const data = await getRepoTree(decodedOwner, decodedName, treePath);
    setTreeData(data);
    return data;
  }, [decodedOwner, decodedName, treePath]);

  const loadBlob = useCallback(async () => {
    if (!filePath) {
      setBlobData(null);
      return null;
    }

    const data = await getRepoBlob(decodedOwner, decodedName, filePath);
    setBlobData(data);
    return data;
  }, [decodedOwner, decodedName, filePath]);

  const loadJobs = useCallback(async () => {
    const data = await listRepoJobs(decodedOwner, decodedName);
    return data;
  }, [decodedOwner, decodedName]);

  const syncJobsState = useCallback((nextJobs) => {
    setJobs(nextJobs);
    setIsPollingEnabled(hasActiveJobs(nextJobs));
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const loadPage = async () => {
      setLoading(true);
      setTreeLoading(true);
      setJobsLoading(true);
      setError("");

      try {
        const [dashboardData, jobsData, treePayload] = await Promise.all([loadDashboard(), loadJobs(), loadTree()]);
        if (isCancelled) {
          return;
        }

        setDashboard(dashboardData);
        syncJobsState(jobsData);
        setTreeData(treePayload);
      } catch (err) {
        if (!isCancelled) {
          setError(err.message);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
          setTreeLoading(false);
          setJobsLoading(false);
        }
      }
    };

    loadPage();

    return () => {
      isCancelled = true;
    };
  }, [loadDashboard, loadJobs, loadTree, syncJobsState]);

  useEffect(() => {
    let cancelled = false;

    const loadSelectedFile = async () => {
      if (tab !== "code" || !filePath) {
        setBlobData(null);
        setBlobLoading(false);
        return;
      }

      setBlobLoading(true);
      try {
        const payload = await loadBlob();
        if (!cancelled) {
          setBlobData(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setBlobData(null);
        }
      } finally {
        if (!cancelled) {
          setBlobLoading(false);
        }
      }
    };

    loadSelectedFile();

    return () => {
      cancelled = true;
    };
  }, [filePath, loadBlob, tab]);

  useEffect(() => {
    let cancelled = false;

    const loadReadme = async () => {
      if (tab !== "code" || filePath) {
        setReadmeData(null);
        setReadmeLoading(false);
        return;
      }

      const entries = Array.isArray(treeData?.entries) ? treeData.entries : [];
      const readmeEntry = entries.find((entry) => entry.type === "file" && /^readme(\.|$)/i.test(entry.name));

      if (!readmeEntry) {
        setReadmeData(null);
        setReadmeLoading(false);
        return;
      }

      setReadmeLoading(true);
      try {
        const payload = await getRepoBlob(decodedOwner, decodedName, readmeEntry.path);
        if (!cancelled) {
          setReadmeData(payload);
        }
      } catch {
        if (!cancelled) {
          setReadmeData(null);
        }
      } finally {
        if (!cancelled) {
          setReadmeLoading(false);
        }
      }
    };

    loadReadme();

    return () => {
      cancelled = true;
    };
  }, [decodedName, decodedOwner, filePath, tab, treeData]);

  useJobPolling({
    enabled: isPollingEnabled,
    fetchJobs: loadJobs,
    onJobs: syncJobsState
  });

  const getNamespaceErrorMessage = () => {
    const username = getAuthUser()?.username || "your-user";
    return `You can only modify repositories in your own namespace (${username}).`;
  };

  const ensureMutationAccess = () => {
    const token = getAuthToken();
    if (!token) {
      navigate(loginRedirectPath);
      return false;
    }

    const authUser = getAuthUser();
    if (authUser?.username && authUser.username !== decodedOwner) {
      setError(getNamespaceErrorMessage());
      return false;
    }

    return true;
  };

  const resolveMutationError = (err) => {
    const status = err && typeof err === "object" ? err.status : undefined;
    const message = err instanceof Error ? err.message : "Request failed";
    const normalized = message.toLowerCase();
    const shouldTreatAsExpiredSession =
      status === 401 &&
      (normalized.includes("invalid authentication token") ||
        normalized.includes("not authenticated") ||
        normalized.includes("user not found"));

    if (shouldTreatAsExpiredSession) {
      clearAuthSession();
      navigate(loginRedirectPath);
      return "Session expired. Please sign in again.";
    }

    if (message.toLowerCase().includes("own namespace")) {
      return getNamespaceErrorMessage();
    }
    return message;
  };

  const handleGenerateReadme = async () => {
    if (!ensureMutationAccess()) {
      return;
    }

    setError("");
    setInfo("");
    try {
      const result = await triggerAiReadme(decodedOwner, decodedName);
      setInfo(`README generation queued. Job ID: ${result.job_id}`);
      const latestJobs = await loadJobs();
      syncJobsState(latestJobs);
      await loadDashboard();
    } catch (err) {
      setError(resolveMutationError(err));
    }
  };

  const openBuildDialog = () => {
    if (!ensureMutationAccess()) {
      return;
    }
    setBuildError("");
    setBuildDialogOpen(true);
  };

  const closeBuildDialog = () => {
    if (buildSubmitting) {
      return;
    }
    setBuildDialogOpen(false);
  };

  const handleBuildSubmit = async (repoName, prompt) => {
    if (!ensureMutationAccess()) {
      return;
    }

    setBuildSubmitting(true);
    setBuildError("");
    setError("");
    setInfo("");

    try {
      const result = await triggerAiBuild(decodedOwner, repoName, prompt);
      setInfo(`Build queued for ${decodedOwner}/${repoName}. Job ID: ${result.job_id}`);
      setBuildDialogOpen(false);
      const latestJobs = await loadJobs();
      syncJobsState(latestJobs);
    } catch (err) {
      const message = resolveMutationError(err);
      setBuildError(message);
      setError(message);
    } finally {
      setBuildSubmitting(false);
    }
  };

  const handleRefresh = async () => {
    setError("");
    setTreeLoading(true);
    setBlobLoading(Boolean(filePath));
    setJobsLoading(true);
    try {
      const blobPromise = filePath ? loadBlob() : Promise.resolve(null);
      const [dashboardData, jobsData, treePayload, blobPayload] = await Promise.all([loadDashboard(), loadJobs(), loadTree(), blobPromise]);
      setDashboard(dashboardData);
      syncJobsState(jobsData);
      setTreeData(treePayload);
      setBlobData(blobPayload);
    } catch (err) {
      setError(err.message);
    } finally {
      setTreeLoading(false);
      setBlobLoading(false);
      setJobsLoading(false);
    }
  };

  const handleCopyClone = async () => {
    try {
      await navigator.clipboard.writeText(cloneUrl);
      setCopiedClone(true);
      window.setTimeout(() => setCopiedClone(false), 1500);
    } catch {
      setError("Unable to copy clone URL from this browser.");
    }
  };

  const handleViewLogs = async (jobId) => {
    setLogsOpen(true);
    setLogsLoading(true);
    setLogsError("");
    setLogsData(null);
    try {
      const data = await getJobLogs(jobId);
      setLogsData(data);
    } catch (err) {
      setLogsError(err.message);
    } finally {
      setLogsLoading(false);
    }
  };

  const closeLogs = () => {
    setLogsOpen(false);
    setLogsLoading(false);
    setLogsError("");
    setLogsData(null);
  };

  const goToTreePath = (nextPath) => {
    const trimmed = (nextPath || "").trim();
    const nextParams = new URLSearchParams(searchParams);
    if (trimmed) {
      nextParams.set("path", trimmed);
    } else {
      nextParams.delete("path");
    }
    nextParams.delete("file");
    setSearchParams(nextParams, { replace: false });
  };

  const syncUrlToFile = (targetPath) => {
    const normalized = (targetPath || "").trim();
    if (!normalized) {
      return;
    }

    const parts = normalized.split("/");
    parts.pop();
    const directory = parts.join("/");

    const nextParams = new URLSearchParams(searchParams);
    if (directory) {
      nextParams.set("path", directory);
    } else {
      nextParams.delete("path");
    }
    nextParams.set("file", normalized);
    setSearchParams(nextParams, { replace: false });
  };

  const openFilePath = (targetPath) => {
    const normalized = (targetPath || "").trim();
    if (!normalized) {
      return;
    }
    syncUrlToFile(normalized);
  };

  const treeBreadcrumbs = useMemo(() => {
    const segments = treePath.split("/").filter(Boolean);
    const crumbs = [{ label: decodedName, path: "" }];
    let current = "";
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      crumbs.push({ label: segment, path: current });
    }
    return crumbs;
  }, [decodedName, treePath]);

  const selectedFileLines = useMemo(() => {
    if (!blobData?.content) {
      return [];
    }
    return blobData.content.replace(/\r\n/g, "\n").split("\n");
  }, [blobData]);

  const openEditorFile = useCallback(
    async (targetPath) => {
      const normalized = (targetPath || "").trim();
      if (!normalized) {
        return;
      }

      setEditorError("");
      setEditorInfo("");

      if (editorFiles[normalized]) {
        setActiveEditorPath(normalized);
        return;
      }

      setEditorLoading(true);
      try {
        const blob = await getRepoBlob(decodedOwner, decodedName, normalized);
        const filePayload = {
          path: normalized,
          name: blob?.name || normalized.split("/").pop(),
          language: getLanguageForPath(normalized),
          content: blob?.content || "",
          originalContent: blob?.content || "",
          isDirty: false,
          isBinary: Boolean(blob?.is_binary),
          isTruncated: Boolean(blob?.truncated)
        };

        setEditorFiles((prev) => ({ ...prev, [normalized]: filePayload }));
        setEditorOrder((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
        setActiveEditorPath(normalized);
      } catch (err) {
        setEditorError(err.message);
      } finally {
        setEditorLoading(false);
      }
    },
    [decodedName, decodedOwner, editorFiles]
  );

  const handleEditorFileOpen = async (targetPath) => {
    syncUrlToFile(targetPath);
    await openEditorFile(targetPath);
  };

  const handleEditorTabActivate = (path) => {
    setActiveEditorPath(path);
    syncUrlToFile(path);
  };

  const closeEditorFile = (path) => {
    setEditorFiles((prev) => {
      if (!prev[path]) {
        return prev;
      }
      const next = { ...prev };
      delete next[path];
      return next;
    });

    setEditorOrder((prev) => {
      const nextOrder = prev.filter((item) => item !== path);
      if (activeEditorPath === path) {
        const nextActive = nextOrder[0] || "";
        setActiveEditorPath(nextActive);
        if (nextActive) {
          syncUrlToFile(nextActive);
        } else {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.delete("file");
          setSearchParams(nextParams, { replace: false });
        }
      }
      return nextOrder;
    });
  };

  const handleEditorChange = (value) => {
    if (!activeEditorPath) {
      return;
    }
    const nextValue = value ?? "";
    setEditorFiles((prev) => {
      const current = prev[activeEditorPath];
      if (!current) {
        return prev;
      }
      const isDirty = nextValue !== current.originalContent;
      return {
        ...prev,
        [activeEditorPath]: {
          ...current,
          content: nextValue,
          isDirty
        }
      };
    });
  };

  const handleEditorSave = async () => {
    if (!activeEditorFile) {
      return;
    }

    if (activeEditorFile.isBinary || activeEditorFile.isTruncated) {
      setEditorError("This file cannot be edited in the browser.");
      return;
    }

    if (!ensureMutationAccess()) {
      return;
    }

    setEditorError("");
    setEditorInfo("");
    setEditorSaving(true);

    try {
      const result = await saveRepoBlob(decodedOwner, decodedName, activeEditorFile.path, activeEditorFile.content);
      if (result?.status === "no_changes") {
        setEditorInfo("No changes to save.");
      } else {
        const commitLabel = result?.commit ? result.commit.slice(0, 7) : "saved";
        setEditorInfo(`Saved ${activeEditorFile.path} (${commitLabel}).`);
      }

      setEditorFiles((prev) => {
        const current = prev[activeEditorFile.path];
        if (!current) {
          return prev;
        }
        return {
          ...prev,
          [activeEditorFile.path]: {
            ...current,
            originalContent: current.content,
            isDirty: false
          }
        };
      });
    } catch (err) {
      setEditorError(resolveMutationError(err));
    } finally {
      setEditorSaving(false);
    }
  };

  const getSelectedEditorText = () => {
    const editor = editorRef.current;
    if (!editor) {
      return "";
    }
    const selection = editor.getSelection();
    if (!selection || selection.isEmpty()) {
      return "";
    }
    const model = editor.getModel();
    if (!model) {
      return "";
    }
    return model.getValueInRange(selection);
  };

  const handleAiRequest = async (mode) => {
    if (!activeEditorFile) {
      setAiError("Open a file to ask AI.");
      setAiPanelOpen(true);
      return;
    }
    if (!ensureMutationAccess()) {
      return;
    }

    const selected = getSelectedEditorText();
    if (!selected) {
      setAiError("Select code in the editor first.");
      setAiPanelOpen(true);
      return;
    }

    setAiPanelOpen(true);
    setAiLoading(true);
    setAiError("");
    setAiResponse("");

    const header =
      mode === "bugai"
        ? "Debug and fix the selected code. Return only the corrected code."
        : "Improve the selected code. Return only the updated code.";
    const prompt = `${header}\nRepository: ${decodedOwner}/${decodedName}\nFile: ${activeEditorFile.path}\nSelected code:\n${selected}`;

    try {
      const result = await askBugAi({ prompt, history: [], owner: decodedOwner, repo: decodedName });
      const answer = typeof result?.answer === "string" ? result.answer.trim() : "";
      if (!answer) {
        setAiError("AI returned an empty response.");
      } else {
        setAiResponse(answer);
      }
    } catch (err) {
      setAiError(err?.message || "Failed to reach AI service.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplyAi = () => {
    if (!aiResponse) {
      setAiError("No AI response to apply.");
      return;
    }
    const editor = editorRef.current;
    if (!editor) {
      setAiError("Editor is not ready.");
      return;
    }
    const selection = editor.getSelection();
    if (!selection || selection.isEmpty()) {
      setAiError("Select code in the editor first.");
      return;
    }
    editor.executeEdits("ai-apply", [{ range: selection, text: aiResponse }]);
    editor.focus();
  };

  useEffect(() => {
    if (tab === "editor" && filePath) {
      openEditorFile(filePath);
    }
  }, [filePath, openEditorFile, tab]);

  const renderRepoTabBody = () => {
    if (loading) {
      return <div className="rounded-md border border-gh-border bg-gh-panel p-4 text-sm text-gh-muted">Loading repository data...</div>;
    }

    if (tab === "code") {
      const entries = Array.isArray(treeData?.entries) ? treeData.entries : [];

      return (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-md border border-gh-border bg-gh-panel">
            <div className="border-b border-gh-border px-4 py-3 text-sm text-gh-muted">{dashboard?.last_commit || "No commit history yet"}</div>
            <div className="border-b border-gh-border px-4 py-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {treeBreadcrumbs.map((crumb, index) => {
                  const isLast = index === treeBreadcrumbs.length - 1;
                  if (isLast) {
                    return (
                      <span key={crumb.path || "root"} className="font-semibold text-gh-text">
                        {crumb.label}
                      </span>
                    );
                  }
                  return (
                    <button
                      key={crumb.path || "root"}
                      type="button"
                      onClick={() => goToTreePath(crumb.path)}
                      className="text-gh-accent hover:underline"
                    >
                      {crumb.label}/
                    </button>
                  );
                })}
              </div>
            </div>

            {treeLoading ? (
              <div className="px-4 py-4 text-sm text-gh-muted">Loading repository files...</div>
            ) : entries.length === 0 ? (
              <div className="px-4 py-4 text-sm text-gh-muted">No files in this directory.</div>
            ) : (
              <ul className="divide-y divide-gh-border">
                {entries.map((entry) => (
                  <li key={entry.path} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-gh-panelAlt/60">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {entry.type === "dir" ? (
                          <button type="button" onClick={() => goToTreePath(entry.path)} className="truncate text-left font-semibold text-gh-accent hover:underline">
                            {entry.name}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openFilePath(entry.path)}
                            className={`truncate text-left hover:underline ${filePath === entry.path ? "font-semibold text-gh-accent" : "text-gh-text"}`}
                          >
                            {entry.name}
                          </button>
                        )}
                        <span className="rounded-full border border-gh-border px-2 py-0.5 text-xs text-gh-muted">{entry.type}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-gh-muted">{entry.path}</p>
                    </div>

                    <span className="whitespace-nowrap text-sm text-gh-muted">{entry.type === "file" ? formatBytes(entry.size_bytes ?? 0) : "--"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {filePath || blobLoading ? (
            <div className="overflow-hidden rounded-md border border-gh-border bg-gh-panel">
              <div className="flex items-center justify-between gap-3 border-b border-gh-border px-4 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gh-text">{blobData?.path || filePath}</p>
                  <p className="text-xs text-gh-muted">
                    {blobData?.size_bytes != null ? `${formatBytes(blobData.size_bytes)} · ` : ""}
                    {blobData?.line_count || 0} lines
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nextParams = new URLSearchParams(searchParams);
                    nextParams.delete("file");
                    setSearchParams(nextParams, { replace: false });
                  }}
                  className="gh-btn rounded-md px-2 py-1 text-xs"
                >
                  Close
                </button>
              </div>

              {blobLoading ? (
                <div className="px-4 py-4 text-sm text-gh-muted">Loading file...</div>
              ) : blobData?.is_binary ? (
                <div className="px-4 py-4 text-sm text-gh-muted">Binary file preview is not supported in read-only viewer.</div>
              ) : (
                <div className="max-h-[60vh] overflow-auto">
                  <table className="w-full border-separate border-spacing-0 font-mono text-sm">
                    <tbody>
                      {selectedFileLines.map((line, index) => (
                        <tr key={`${index}-${line.length}`}>
                          <td className="w-14 select-none border-r border-gh-border bg-gh-panelAlt px-3 py-0.5 text-right text-xs text-gh-muted">
                            {index + 1}
                          </td>
                          <td className="whitespace-pre-wrap break-words px-3 py-0.5 text-gh-text">{line || " "}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {blobData?.truncated ? (
                <div className="border-t border-gh-border px-4 py-2 text-xs text-gh-muted">
                  File truncated to {formatBytes(blobData.max_view_bytes)} for web preview.
                </div>
              ) : null}
            </div>
          ) : null}

          {!filePath ? <ReadmePanel loading={readmeLoading} blob={readmeData} /> : null}

          <div className="overflow-hidden rounded-md border border-gh-border bg-gh-panel">
            <table className="min-w-full text-sm">
              <tbody>
                <tr className="border-b border-gh-border hover:bg-gh-panelAlt/60">
                  <td className="px-4 py-3 text-gh-text">Branches</td>
                  <td className="px-4 py-3 text-right text-gh-muted">{dashboard?.branches?.length || 0}</td>
                </tr>
                <tr className="border-b border-gh-border hover:bg-gh-panelAlt/60">
                  <td className="px-4 py-3 text-gh-text">Files tracked</td>
                  <td className="px-4 py-3 text-right text-gh-muted">{dashboard?.files ?? 0}</td>
                </tr>
                <tr className="border-b border-gh-border hover:bg-gh-panelAlt/60">
                  <td className="px-4 py-3 text-gh-text">Repository size</td>
                  <td className="px-4 py-3 text-right text-gh-muted">{formatBytes(dashboard?.size_bytes ?? 0)}</td>
                </tr>
                <tr className="hover:bg-gh-panelAlt/60">
                  <td className="px-4 py-3 text-gh-text">Clone URL</td>
                  <td className="max-w-[360px] truncate px-4 py-3 text-right text-gh-muted">{cloneUrl}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (tab === "editor") {
      const entries = Array.isArray(treeData?.entries) ? treeData.entries : [];
      const isReadOnly = Boolean(activeEditorFile?.isBinary || activeEditorFile?.isTruncated);

      return (
        <div className="space-y-4">
          {editorError ? <p className="rounded-md border border-gh-danger/40 bg-gh-danger/10 p-3 text-sm text-gh-danger">{editorError}</p> : null}
          {editorInfo ? <p className="rounded-md border border-gh-success/40 bg-gh-success/10 p-3 text-sm text-[#7ee787]">{editorInfo}</p> : null}

          <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="space-y-3">
              <div className="rounded-md border border-gh-border bg-gh-panel">
                <div className="border-b border-gh-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gh-muted">Files</div>
                <div className="border-b border-gh-border px-4 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gh-muted">
                    {treeBreadcrumbs.map((crumb, index) => {
                      const isLast = index === treeBreadcrumbs.length - 1;
                      if (isLast) {
                        return (
                          <span key={crumb.path || "root"} className="font-semibold text-gh-text">
                            {crumb.label}
                          </span>
                        );
                      }
                      return (
                        <button
                          key={crumb.path || "root"}
                          type="button"
                          onClick={() => goToTreePath(crumb.path)}
                          className="text-gh-accent hover:underline"
                        >
                          {crumb.label}/
                        </button>
                      );
                    })}
                  </div>
                </div>

                {treeLoading ? (
                  <div className="px-4 py-4 text-sm text-gh-muted">Loading repository files...</div>
                ) : entries.length === 0 ? (
                  <div className="px-4 py-4 text-sm text-gh-muted">No files in this directory.</div>
                ) : (
                  <ul className="divide-y divide-gh-border">
                    {entries.map((entry) => (
                      <li key={entry.path} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-gh-panelAlt/60">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {entry.type === "dir" ? (
                              <button type="button" onClick={() => goToTreePath(entry.path)} className="truncate text-left font-semibold text-gh-accent hover:underline">
                                {entry.name}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleEditorFileOpen(entry.path)}
                                className={`truncate text-left hover:underline ${
                                  activeEditorPath === entry.path ? "font-semibold text-gh-accent" : "text-gh-text"
                                }`}
                              >
                                {entry.name}
                              </button>
                            )}
                            <span className="rounded-full border border-gh-border px-2 py-0.5 text-xs text-gh-muted">{entry.type}</span>
                          </div>
                          <p className="mt-1 truncate text-xs text-gh-muted">{entry.path}</p>
                        </div>

                        <span className="whitespace-nowrap text-xs text-gh-muted">{entry.type === "file" ? formatBytes(entry.size_bytes ?? 0) : "--"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gh-border bg-gh-panel p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleEditorSave}
                    disabled={!activeEditorFile || !activeEditorFile.isDirty || isReadOnly || editorSaving}
                    className="gh-btn-primary rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
                  >
                    {editorSaving ? "Saving..." : "Save & Commit"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAiRequest("shitai")}
                    disabled={!activeEditorFile}
                    className="gh-btn rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
                  >
                    Ask Sh*tAI
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAiRequest("bugai")}
                    disabled={!activeEditorFile}
                    className="gh-btn rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
                  >
                    Debug with BugAI
                  </button>
                </div>
                <span className="text-xs text-gh-muted">{activeEditorFile?.path || "No file selected"}</span>
              </div>

              {isReadOnly ? (
                <div className="rounded-md border border-gh-warning/40 bg-gh-warning/10 p-3 text-xs text-gh-warning">
                  This file is binary or too large to edit in the browser.
                </div>
              ) : null}

              <div className="space-y-4">
                <div className="overflow-hidden rounded-md border border-gh-border bg-gh-panel">
                  <div className="flex flex-wrap items-center gap-2 border-b border-gh-border px-3 py-2">
                    {editorOrder.length === 0 ? (
                      <span className="text-xs text-gh-muted">No files open.</span>
                    ) : (
                      editorOrder.map((path) => {
                        const file = editorFiles[path];
                        if (!file) {
                          return null;
                        }
                        const isActive = path === activeEditorPath;
                        return (
                          <div
                            key={path}
                            className={`flex items-center gap-2 rounded-md border px-2 py-1 text-xs ${
                              isActive ? "border-gh-accent text-gh-text" : "border-transparent text-gh-muted hover:text-gh-text"
                            }`}
                          >
                            <button type="button" onClick={() => handleEditorTabActivate(path)} className="truncate">
                              {file.name}
                              {file.isDirty ? "*" : ""}
                            </button>
                            <button type="button" onClick={() => closeEditorFile(path)} className="text-gh-muted hover:text-gh-text">
                              ×
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="min-h-[420px]">
                    {editorLoading && !activeEditorFile ? (
                      <div className="px-4 py-6 text-sm text-gh-muted">Opening file...</div>
                    ) : activeEditorFile ? (
                      <MonacoEditor
                        height="75vh"
                        theme="vs-dark"
                        path={activeEditorFile.path}
                        language={activeEditorFile.language}
                        value={activeEditorFile.content}
                        onChange={handleEditorChange}
                        onMount={(editor) => {
                          editorRef.current = editor;
                        }}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 13,
                          readOnly: isReadOnly
                        }}
                      />
                    ) : (
                      <div className="px-4 py-6 text-sm text-gh-muted">Select a file to start editing.</div>
                    )}
                  </div>
                </div>

                <aside className="rounded-md border border-gh-border bg-gh-panel p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gh-text">AI Panel</h3>
                    <button type="button" onClick={() => setAiPanelOpen((value) => !value)} className="text-xs text-gh-muted hover:text-gh-text">
                      {aiPanelOpen ? "Hide" : "Show"}
                    </button>
                  </div>
                  {aiPanelOpen ? (
                    <div className="mt-3 space-y-3">
                      {aiError ? <p className="rounded-md border border-gh-danger/40 bg-gh-danger/10 p-2 text-xs text-gh-danger">{aiError}</p> : null}
                      {aiLoading ? <p className="text-xs text-gh-muted">Thinking...</p> : null}
                      {aiResponse ? (
                        <div className="max-h-[45vh] overflow-auto rounded-md border border-gh-border bg-gh-bg p-2 text-xs text-gh-text whitespace-pre-wrap">
                          {aiResponse}
                        </div>
                      ) : (
                        <p className="text-xs text-gh-muted">Select code and ask AI to see responses here.</p>
                      )}
                      <button
                        type="button"
                        onClick={handleApplyAi}
                        disabled={!aiResponse}
                        className="gh-btn-primary w-full rounded-md px-3 py-2 text-xs font-semibold disabled:opacity-60"
                      >
                        Apply to selection
                      </button>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-gh-muted">AI suggestions are hidden.</p>
                  )}
                </aside>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (tab === "actions") {
      const commits = Array.isArray(dashboard?.recent_commits) ? dashboard.recent_commits : [];

      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gh-border bg-gh-panel p-3">
            <p className="text-sm text-gh-muted">Run and monitor automation tasks for this repository.</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={openBuildDialog} className="gh-btn-primary rounded-md px-3 py-1.5 text-sm font-semibold">
                <span className="inline-flex items-center gap-1.5">
                  {/* <ShithubIcon className="h-3.5 w-3.5" /> */}
                  <span>Build sh*t</span>
                </span>
              </button>
              <button type="button" onClick={handleGenerateReadme} className="gh-btn rounded-md px-3 py-1.5 text-sm font-semibold">
                Generate README
              </button>
            </div>
          </div>

          <div className="rounded-md border border-gh-border bg-gh-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Commit History</h2>
              <span className="rounded-full border border-gh-border px-2 py-0.5 text-xs text-gh-muted">{commits.length}</span>
            </div>
            {commits.length === 0 ? (
              <p className="text-sm text-gh-muted">No commits found yet.</p>
            ) : (
              <ul className="divide-y divide-gh-border overflow-hidden rounded-md border border-gh-border">
                {commits.map((commit) => (
                  <li key={commit.hash} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 hover:bg-gh-panelAlt/60">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-gh-text">
                        <span className="font-mono text-gh-accent">{commit.short_hash}</span>
                        <span className="mx-2 text-gh-muted">|</span>
                        {commit.message}
                      </p>
                      <p className="truncate text-xs text-gh-muted">{commit.author}</p>
                    </div>
                    <span className="whitespace-nowrap text-xs text-gh-muted">{commit.relative_time}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-md border border-gh-border bg-gh-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Automation Jobs</h2>
              {hasActiveJobs(jobs) ? <StatusPill status="running" /> : <StatusPill status="idle" />}
            </div>
            <JobsTable jobs={jobs} loading={jobsLoading} onViewLogs={handleViewLogs} />
          </div>
        </div>
      );
    }

    return (
      <EmptyStatePanel
        title={`${tab.charAt(0).toUpperCase()}${tab.slice(1)} is available, but there is no backend data yet.`}
        description="This route is fully navigable and URL-based. Backend support for this section can be added later without changing navigation."
      />
    );
  };

  if (!decodedOwner || !decodedName) {
    return <Navigate to="/" replace />;
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gh-border pb-3">
        <div className="flex items-center gap-2 text-sm">
          <h1 className="text-3xl font-semibold text-gh-text">{repoLabel}</h1>
          <span className="rounded-full border border-gh-border px-2 py-0.5 text-xs text-gh-muted">Public</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="gh-btn rounded-md px-3 py-1.5 text-sm font-semibold">
            Watch
          </button>
          <button type="button" className="gh-btn rounded-md px-3 py-1.5 text-sm font-semibold">
            Fork
          </button>
          <button type="button" className="gh-btn rounded-md px-3 py-1.5 text-sm font-semibold">
            Star
          </button>
        </div>
      </div>

      <RepoTabNav owner={decodedOwner} name={decodedName} />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gh-border bg-gh-panel p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="gh-btn rounded-md px-3 py-1.5 text-sm font-semibold">
            {dashboard?.branches?.[0] || "main"}
          </button>
          <button type="button" className="gh-btn rounded-md px-3 py-1.5 text-sm font-semibold">
            Go to file
          </button>
          <button type="button" className="gh-btn rounded-md px-3 py-1.5 text-sm font-semibold">
            Add file
          </button>
          <button type="button" onClick={handleCopyClone} className="gh-btn-primary rounded-md px-3 py-1.5 text-sm font-semibold">
            {copiedClone ? "Clone URL copied" : "Code"}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link to={`/u/${encodeURIComponent(decodedOwner)}/repositories`} className="gh-btn rounded-md px-3 py-1.5 text-sm font-semibold">
            Back
          </Link>
          <button type="button" onClick={handleRefresh} className="gh-btn rounded-md px-3 py-1.5 text-sm font-semibold">
            Refresh
          </button>
        </div>
      </div>

      {error ? <p className="rounded-md border border-gh-danger/40 bg-gh-danger/10 p-3 text-sm text-gh-danger">{error}</p> : null}
      {info ? <p className="rounded-md border border-gh-success/40 bg-gh-success/10 p-3 text-sm text-[#7ee787]">{info}</p> : null}

      {tab === "editor" ? (
        <div className="space-y-4">{renderRepoTabBody()}</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">{renderRepoTabBody()}</div>

          <aside className="space-y-4">
            <div className="rounded-md border border-gh-border bg-gh-panel p-4">
              <h3 className="text-xl font-semibold">About</h3>
              <p className="mt-3 text-sm leading-6 text-gh-muted">
                Automation-first Git repository powered by Sh*thub. Use this page to monitor repository state and jobs.
              </p>

              <div className="mt-4 space-y-2 border-t border-gh-border pt-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gh-muted">Owner</span>
                  <span className="font-semibold text-gh-text">{decodedOwner}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gh-muted">Repository</span>
                  <span className="font-semibold text-gh-text">{decodedName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gh-muted">Branches</span>
                  <span className="text-gh-text">{dashboard?.branches?.length || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gh-muted">Last Commit</span>
                  <span className="max-w-[180px] truncate text-right text-gh-text">{dashboard?.last_commit || "n/a"}</span>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-gh-border bg-gh-panel p-4">
              <h3 className="text-sm font-semibold text-gh-text">Clone</h3>
              <p className="mt-2 break-all rounded-md border border-gh-border bg-gh-bg p-2 text-xs text-gh-muted">{cloneUrl}</p>
              <button type="button" onClick={handleCopyClone} className="gh-btn mt-3 w-full rounded-md px-3 py-2 text-sm font-semibold">
                {copiedClone ? "Copied" : "Copy clone URL"}
              </button>
            </div>
          </aside>
        </div>
      )}

      <JobLogsModal isOpen={logsOpen} onClose={closeLogs} loading={logsLoading} error={logsError} logsData={logsData} />

      <BuildWithAiDialog
        isOpen={buildDialogOpen}
        owner={decodedOwner}
        repoOptions={buildRepoOptions}
        defaultRepo={decodedName}
        loadingRepos={false}
        submitting={buildSubmitting}
        error={buildError}
        info=""
        onClose={closeBuildDialog}
        onSubmit={handleBuildSubmit}
      />
    </section>
  );
}

export default RepoPage;
