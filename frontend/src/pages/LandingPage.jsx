import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getRepoDashboard, listRepoJobs, listRepos, triggerAiBuild } from "../api/client";
import ShithubIcon from "../components/ShithubIcon";
import { getAuthUser } from "../utils/authStorage";

const STATUS_STYLES = {
  queued: "border-[#9e6a03]/60 bg-[#9e6a03]/15 text-[#d29922]",
  running: "border-[#1f6feb]/60 bg-[#1f6feb]/15 text-[#58a6ff]",
  success: "border-[#238636]/60 bg-[#238636]/15 text-[#3fb950]",
  failed: "border-[#da3633]/60 bg-[#da3633]/15 text-[#f85149]",
  failure: "border-[#da3633]/60 bg-[#da3633]/15 text-[#f85149]",
  revoked: "border-gh-border bg-gh-panelAlt text-gh-muted"
};

const GUEST_FEATURE_PREVIEW = [
  {
    title: "README Automation",
    status: "Queued",
    progressClass: "w-2/3",
    description: "Generate repository docs and keep project onboarding fast."
  },
  {
    title: "Write code with sh*tAI",
    status: "Running",
    progressClass: "w-1/2",
    description: "Queue coding tasks from prompts and push updates to your repo."
  },
  {
    title: "Jobs + Logs",
    status: "Success",
    progressClass: "w-5/6",
    description: "Track queued/running jobs and inspect execution logs in one place."
  }
];

function formatRelativeTime(value) {
  if (!value) {
    return "unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const ranges = [
    { unit: "day", value: 86_400 },
    { unit: "hour", value: 3_600 },
    { unit: "minute", value: 60 },
    { unit: "second", value: 1 }
  ];

  for (const range of ranges) {
    if (Math.abs(seconds) >= range.value || range.unit === "second") {
      return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
        Math.trunc(seconds / range.value),
        range.unit
      );
    }
  }

  return "just now";
}

function normalizeStatus(status) {
  return (status || "").toLowerCase();
}

function getStatusClass(status) {
  const normalized = normalizeStatus(status);
  return STATUS_STYLES[normalized] || STATUS_STYLES.revoked;
}

function GuestLandingView({ authUser, username }) {
  return (
    <section className="mx-auto w-full max-w-6xl space-y-10 py-6">
      <div className="grid gap-8 rounded-xl border border-gh-border bg-gh-panel p-8 lg:grid-cols-[1.2fr_1fr] lg:p-12">
        <div className="space-y-6">
          <p className="inline-flex rounded-full border border-gh-border bg-gh-panelAlt px-3 py-1 text-xs font-semibold tracking-wide text-gh-muted">
            AI-Native Git Hosting
          </p>

          <h1 className="text-4xl font-bold leading-tight text-gh-text lg:text-6xl">
            Build, ship, and automate your sh*t in one place.
          </h1>

          <p className="max-w-2xl text-base leading-7 text-gh-muted lg:text-lg">
            Sh*thub is a developer workspace where your sh*t code lives, evolves, and documents itself, complete with repository control, seamless Git operations, and intelligent automation.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {authUser ? (
              <>
                {/* <Link
                  to={`/u/${encodeURIComponent(username)}/repositories`}
                  className="gh-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold"
                >
                  Continue as {username}
                </Link> */}
                <Link to={`/u/${encodeURIComponent(username)}/profile`} className="gh-btn rounded-md px-5 py-2.5 text-sm font-semibold">
                  View profile
                </Link>
              </>
            ) : (
              <>
                <Link to="/auth/register" className="gh-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
                  Sign up for Sh*thub
                </Link>
                <Link to="/auth/login" className="gh-btn rounded-md px-5 py-2.5 text-sm font-semibold">
                  Login
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gh-border bg-gh-bg p-4">
          <div className="space-y-3">
            {GUEST_FEATURE_PREVIEW.map((feature) => (
              <div key={feature.title} className="space-y-3 rounded-md border border-gh-border bg-gh-panel p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-1.5 text-gh-muted">
                    {feature.title.toLowerCase().includes("sh*tai") ? <ShithubIcon className="h-3.5 w-3.5" /> : null}
                    <span>{feature.title}</span>
                  </span>
                  <span className="rounded-full border border-gh-border px-2 py-0.5 text-xs text-[#7ee787]">{feature.status}</span>
                </div>
                <div className="h-2 rounded-full bg-gh-panelAlt">
                  <div className={`h-2 rounded-full bg-[#2ea043] ${feature.progressClass}`} />
                </div>
                <p className="text-sm text-gh-muted">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-lg border border-gh-border bg-gh-panel p-5">
          <h2 className="text-lg font-semibold text-gh-text">Private by default</h2>
          <p className="mt-2 text-sm leading-6 text-gh-muted">Unauthenticated users only see this public home page. Repository data remains protected.</p>
        </article>
        <article className="rounded-lg border border-gh-border bg-gh-panel p-5">
          <h2 className="text-lg font-semibold text-gh-text">Git Smart HTTP</h2>
          <p className="mt-2 text-sm leading-6 text-gh-muted">Clone and push over `/repos/*` using standard Git clients and existing workflows.</p>
        </article>
        <article className="rounded-lg border border-gh-border bg-gh-panel p-5">
          <h2 className="text-lg font-semibold text-gh-text">Background AI jobs</h2>
          <p className="mt-2 text-sm leading-6 text-gh-muted">Queue README generation, track progress, and inspect logs from a single dashboard.</p>
        </article>
      </div>

      <div className="rounded-lg border border-gh-border bg-gh-panel p-6">
        <h3 className="text-xl font-semibold text-gh-text">Get started</h3>
        <ol className="mt-4 space-y-2 text-sm text-gh-muted">
          <li>1. Create an account with email and password.</li>
          <li>2. Create repositories under your namespace.</li>
          <li>3. Use sh*tAI to write code or generate README, then monitor jobs/logs.</li>
        </ol>
      </div>
    </section>
  );
}

function LoggedInHomeDashboard({ authUser }) {
  const owner = authUser?.username || "";
  const promptInputRef = useRef(null);
  const [repos, setRepos] = useState([]);
  const [repoSearch, setRepoSearch] = useState("");
  const [selectedRepo, setSelectedRepo] = useState("");
  const [jobs, setJobs] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [reposLoading, setReposLoading] = useState(true);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [reposError, setReposError] = useState("");
  const [feedError, setFeedError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [composerSubmitting, setComposerSubmitting] = useState(false);
  const [composerError, setComposerError] = useState("");
  const [queuedJob, setQueuedJob] = useState(null);
  const [composerInfo, setComposerInfo] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadRepos = async () => {
      if (!owner) {
        if (!cancelled) {
          setRepos([]);
          setSelectedRepo("");
          setReposLoading(false);
        }
        return;
      }

      setReposLoading(true);
      setReposError("");
      try {
        const data = await listRepos(owner);
        if (cancelled) {
          return;
        }

        setRepos(data);
        setSelectedRepo((current) => {
          if (current && data.some((repo) => repo.name === current)) {
            return current;
          }
          return data[0]?.name || "";
        });
      } catch (err) {
        if (!cancelled) {
          setRepos([]);
          setSelectedRepo("");
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
    let cancelled = false;

    const loadFeed = async () => {
      if (!owner || !selectedRepo) {
        if (!cancelled) {
          setJobs([]);
          setDashboard(null);
          setFeedError("");
          setJobsLoading(false);
          setDashboardLoading(false);
        }
        return;
      }

      setFeedError("");
      setJobsLoading(true);
      setDashboardLoading(true);

      const [jobsResult, dashboardResult] = await Promise.allSettled([
        listRepoJobs(owner, selectedRepo),
        getRepoDashboard(owner, selectedRepo)
      ]);

      if (cancelled) {
        return;
      }

      if (jobsResult.status === "fulfilled") {
        setJobs(jobsResult.value);
      } else {
        setJobs([]);
        setFeedError(jobsResult.reason?.message || "Unable to load job activity.");
      }

      if (dashboardResult.status === "fulfilled") {
        setDashboard(dashboardResult.value);
      } else {
        setDashboard(null);
        setFeedError(dashboardResult.reason?.message || "Unable to load repository summary.");
      }

      setJobsLoading(false);
      setDashboardLoading(false);
    };

    loadFeed();

    return () => {
      cancelled = true;
    };
  }, [owner, selectedRepo]);

  const filteredRepos = useMemo(() => {
    const normalized = repoSearch.trim().toLowerCase();
    if (!normalized) {
      return repos;
    }
    return repos.filter((repo) => repo.name.toLowerCase().includes(normalized));
  }, [repoSearch, repos]);

  const recentCommits = useMemo(() => {
    const commits = Array.isArray(dashboard?.recent_commits) ? dashboard.recent_commits : [];
    return commits.slice(0, 6);
  }, [dashboard]);
  const hasRepos = repos.length > 0;

  const timelineItems = useMemo(() => {
    const items = [];
    for (const job of jobs.slice(0, 4)) {
      items.push({
        id: `job-${job.id}`,
        title: `${job.task.replaceAll("_", " ")} ${normalizeStatus(job.status)}`,
        meta: formatRelativeTime(job.created_at),
        to: `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(selectedRepo)}/actions`
      });
    }

    for (const commit of recentCommits.slice(0, 4)) {
      items.push({
        id: `commit-${commit.hash}`,
        title: commit.message,
        meta: `${commit.short_hash} | ${commit.relative_time}`,
        to: `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(selectedRepo)}/code`
      });
    }

    return items.slice(0, 8);
  }, [jobs, owner, recentCommits, selectedRepo]);

  const canSubmitComposer = Boolean(selectedRepo && prompt.trim() && !composerSubmitting);

  const handleQueueBuild = async (event) => {
    event.preventDefault();
    const cleanPrompt = prompt.trim();

    if (!selectedRepo) {
      setComposerError("Select a repository first.");
      return;
    }
    if (!cleanPrompt) {
      setComposerError("Instruction is required.");
      return;
    }

    setComposerSubmitting(true);
    setComposerError("");
    setComposerInfo("");
    setQueuedJob(null);

    try {
      const result = await triggerAiBuild(owner, selectedRepo, cleanPrompt);
      setPrompt("");
      setQueuedJob({
        repo: selectedRepo,
        id: result.job_id
      });
      setComposerInfo(`Build queued for ${owner}/${selectedRepo}.`);

      const latestJobs = await listRepoJobs(owner, selectedRepo);
      setJobs(latestJobs);
    } catch (err) {
      setComposerError(err?.message || "Failed to queue build.");
    } finally {
      setComposerSubmitting(false);
    }
  };

  const focusComposer = () => {
    promptInputRef.current?.focus();
  };

  const ownerEncoded = encodeURIComponent(owner);
  const selectedRepoEncoded = encodeURIComponent(selectedRepo);
  const repoBasePath = selectedRepo ? `/repo/${ownerEncoded}/${selectedRepoEncoded}` : "";

  return (
    <section className="mx-auto w-full max-w-[1600px] space-y-4 py-2">
      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_300px]">
        <aside className="space-y-4">
          <div className="rounded-md border border-gh-border bg-gh-panel">
            <div className="flex items-center justify-between border-b border-gh-border px-4 py-3">
              <h2 className="text-lg font-semibold text-gh-text">Top repositories</h2>
              <Link to={`/u/${ownerEncoded}/repositories`} className="gh-btn-primary rounded-md px-3 py-1.5 text-sm font-semibold">
                New
              </Link>
            </div>
            <div className="space-y-3 p-4">
              <input
                value={repoSearch}
                onChange={(event) => setRepoSearch(event.target.value)}
                placeholder="Find a repository..."
                className="w-full rounded-md border border-gh-border bg-gh-bg px-3 py-2 text-sm text-gh-text outline-none ring-gh-accent focus:ring-1"
              />

              {reposLoading ? (
                <p className="text-sm text-gh-muted">Loading repositories...</p>
              ) : reposError ? (
                <p className="rounded-md border border-gh-danger/40 bg-gh-danger/10 p-2 text-sm text-gh-danger">{reposError}</p>
              ) : filteredRepos.length === 0 ? (
                <p className="text-sm text-gh-muted">No repositories found.</p>
              ) : (
                <ul className="space-y-1">
                  {filteredRepos.map((repo) => {
                    const isActive = repo.name === selectedRepo;
                    return (
                      <li key={repo.name}>
                        <button
                          type="button"
                          onClick={() => setSelectedRepo(repo.name)}
                          className={`flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-sm ${
                            isActive ? "border-gh-accent bg-gh-panelAlt text-gh-text" : "border-transparent text-gh-muted hover:border-gh-border hover:bg-gh-panelAlt"
                          }`}
                        >
                          <span className="truncate font-medium">{repo.name}</span>
                          <span className="text-xs text-gh-muted">{repo.owner}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {repos.length === 0 && !reposLoading ? (
                <div className="rounded-md border border-gh-border bg-gh-panelAlt p-3 text-sm text-gh-muted">
                  Create your first repository to start building with sh*tAI.
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <div className="space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight text-gh-text">Home</h1>

          {!reposLoading && !hasRepos ? (
            <div className="rounded-md border border-gh-border bg-gh-panel p-4">
              <h2 className="text-lg font-semibold text-gh-text">Create your first repository</h2>
              <p className="mt-2 text-sm text-gh-muted">
                You need at least one repository before queueing a `Build with sh*tAI` job.
              </p>
              <Link to={`/u/${ownerEncoded}/repositories`} className="gh-btn-primary mt-3 inline-flex rounded-md px-4 py-2 text-sm font-semibold">
                Go to repositories
              </Link>
            </div>
          ) : null}

          <div className="rounded-xl border border-gh-border bg-gh-panel p-4">
            <form onSubmit={handleQueueBuild} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="inline-flex items-center gap-2 text-2xl font-semibold text-gh-text">
                  <span>Ask</span>
                  {/* <ShithubIcon className="h-5 w-5" /> */}
                  <span>sh*tAI to Build for you</span>
                </h2>
                <span className="rounded-full border border-gh-border bg-gh-panelAlt px-2 py-1 text-xs text-gh-muted">llama-3.1-8b-instant</span>
              </div>

              <textarea
                ref={promptInputRef}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={5}
                placeholder={hasRepos ? "Write code request, for example: add a calculator module with tests." : "Create a repository first to start composing."}
                className="w-full rounded-md border border-gh-border bg-gh-bg px-3 py-2 text-sm text-gh-text outline-none ring-gh-accent focus:ring-1"
              />

              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm text-gh-muted" htmlFor="shitai-home-repo">
                  Repository
                </label>
                <select
                  id="shitai-home-repo"
                  value={selectedRepo}
                  onChange={(event) => setSelectedRepo(event.target.value)}
                  className="rounded-md border border-gh-border bg-gh-bg px-3 py-2 text-sm text-gh-text outline-none ring-gh-accent focus:ring-1"
                >
                  <option value="">Select repository</option>
                  {repos.map((repo) => (
                    <option key={repo.name} value={repo.name}>
                      {repo.name}
                    </option>
                  ))}
                </select>

                <button type="submit" disabled={!canSubmitComposer} className="gh-btn-primary ml-auto rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-60">
                  {composerSubmitting ? (
                    "Queueing..."
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      {/* <ShithubIcon className="h-3.5 w-3.5" /> */}
                      <span>Build sh*t</span>
                    </span>
                  )}
                </button>
              </div>

              {composerError ? <p className="rounded-md border border-gh-danger/40 bg-gh-danger/10 p-2 text-sm text-gh-danger">{composerError}</p> : null}
              {!hasRepos && !reposLoading ? (
                <p className="rounded-md border border-gh-border bg-gh-panelAlt p-2 text-sm text-gh-muted">
                  Composer is available after you create your first repository.
                </p>
              ) : null}
              {composerInfo ? (
                <div className="rounded-md border border-gh-success/40 bg-gh-success/10 p-2 text-sm text-[#7ee787]">
                  <p>{composerInfo}</p>
                  {queuedJob ? (
                    <Link
                      to={`/repo/${ownerEncoded}/${encodeURIComponent(queuedJob.repo)}/actions`}
                      className="mt-2 inline-block font-semibold text-[#7ee787] underline"
                    >
                      View job {queuedJob.id}
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </form>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={focusComposer} className="gh-btn rounded-md px-4 py-2 text-sm font-semibold">
              Write code
            </button>
            <Link to={`/u/${ownerEncoded}/repositories`} className="gh-btn rounded-md px-4 py-2 text-sm font-semibold">
              All repositories
            </Link>
            <Link to={repoBasePath ? `${repoBasePath}/code` : `/u/${ownerEncoded}/repositories`} className="gh-btn rounded-md px-4 py-2 text-sm font-semibold">
              Open repo
            </Link>
            <Link to={repoBasePath ? `${repoBasePath}/actions` : `/u/${ownerEncoded}/repositories`} className="gh-btn rounded-md px-4 py-2 text-sm font-semibold">
              View actions
            </Link>
          </div>

          {feedError ? <p className="rounded-md border border-gh-danger/40 bg-gh-danger/10 p-3 text-sm text-gh-danger">{feedError}</p> : null}

          <div className="space-y-4 rounded-md border border-gh-border bg-gh-panel p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-gh-text">Feed</h2>
              {selectedRepo ? <span className="text-sm text-gh-muted">{owner}/{selectedRepo}</span> : null}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <article className="rounded-md border border-gh-border bg-gh-bg p-3">
                <h3 className="text-sm font-semibold text-gh-text">Recent jobs</h3>
                {jobsLoading ? (
                  <p className="mt-2 text-sm text-gh-muted">Loading jobs...</p>
                ) : jobs.length === 0 ? (
                  <p className="mt-2 text-sm text-gh-muted">No jobs yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {jobs.slice(0, 5).map((job) => (
                      <li key={job.id} className="rounded-md border border-gh-border bg-gh-panel px-2 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm text-gh-text">{job.task.replaceAll("_", " ")}</p>
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${getStatusClass(job.status)}`}>{normalizeStatus(job.status)}</span>
                        </div>
                        <p className="mt-1 text-xs text-gh-muted">{formatRelativeTime(job.created_at)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </article>

              <article className="rounded-md border border-gh-border bg-gh-bg p-3">
                <h3 className="text-sm font-semibold text-gh-text">Recent commits</h3>
                {dashboardLoading ? (
                  <p className="mt-2 text-sm text-gh-muted">Loading commits...</p>
                ) : recentCommits.length === 0 ? (
                  <p className="mt-2 text-sm text-gh-muted">No commits yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {recentCommits.slice(0, 5).map((commit) => (
                      <li key={commit.hash} className="rounded-md border border-gh-border bg-gh-panel px-2 py-2">
                        <p className="truncate text-sm text-gh-text">
                          <span className="font-mono text-gh-accent">{commit.short_hash}</span>
                          <span className="mx-2 text-gh-muted">|</span>
                          {commit.message}
                        </p>
                        <p className="mt-1 truncate text-xs text-gh-muted">{commit.author} | {commit.relative_time}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-md border border-gh-border bg-gh-panel p-4">
            <h2 className="text-2xl font-semibold text-gh-text">Latest updates</h2>
            {selectedRepo ? <p className="mt-1 text-sm text-gh-muted">From {owner}/{selectedRepo}</p> : null}

            {timelineItems.length === 0 ? (
              <p className="mt-3 text-sm text-gh-muted">No activity yet for this repository.</p>
            ) : (
              <ol className="mt-4 space-y-4 border-l border-gh-border pl-4">
                {timelineItems.map((item) => (
                  <li key={item.id} className="relative">
                    <span className="absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full border border-gh-border bg-gh-panelAlt" />
                    <Link to={item.to} className="block text-sm font-medium text-gh-text hover:text-gh-accent hover:underline">
                      {item.title}
                    </Link>
                    <p className="mt-1 text-xs text-gh-muted">{item.meta}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="rounded-md border border-gh-border bg-gh-panel p-4">
            <h3 className="text-sm font-semibold text-gh-text">Repository summary</h3>
            {dashboard ? (
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gh-muted">Branches</span>
                  <span>{dashboard.branches?.length || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gh-muted">Files</span>
                  <span>{dashboard.files ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gh-muted">Last commit</span>
                  <span className="max-w-[160px] truncate text-right">{dashboard.last_commit || "n/a"}</span>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-gh-muted">Select a repository to see details.</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

function LandingPage({ isAuthenticated = false }) {
  const authUser = getAuthUser();
  const username = authUser?.username || "";
  const shouldShowDashboard = Boolean(isAuthenticated && authUser?.username);

  if (shouldShowDashboard) {
    return <LoggedInHomeDashboard authUser={authUser} />;
  }

  return <GuestLandingView authUser={authUser} username={username} />;
}

export default LandingPage;
