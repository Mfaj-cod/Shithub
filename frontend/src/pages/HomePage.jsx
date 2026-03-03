import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { createRepo, deleteRepo, listRepos, triggerAiBuild, triggerAiReadme } from "../api/client";
import BuildWithAiDialog from "../components/BuildWithAiDialog";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyStatePanel from "../components/EmptyStatePanel";
import RepoTable from "../components/RepoTable";
import ShithubIcon from "../components/ShithubIcon";
import UserTabNav, { isValidUserTab } from "../components/UserTabNav";
import { clearAuthSession, getAuthToken, getAuthUser } from "../utils/authStorage";
import { setStoredOwner } from "../utils/ownerStorage";

function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { owner = "honey", tab = "repositories" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const decodedOwner = useMemo(() => decodeURIComponent(owner), [owner]);
  const queryFilter = searchParams.get("q") || "";
  const [ownerInput, setOwnerInput] = useState(decodedOwner);
  const [repos, setRepos] = useState([]);
  const [newRepoName, setNewRepoName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [busyRepo, setBusyRepo] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [deleteTarget, setDeleteTarget] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [repoFilter, setRepoFilter] = useState(queryFilter);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [buildDialogOpen, setBuildDialogOpen] = useState(false);
  const [buildSubmitting, setBuildSubmitting] = useState(false);
  const [buildError, setBuildError] = useState("");
  const authUser = getAuthUser();
  const canBuildWithAi = Boolean(authUser?.username && authUser.username === decodedOwner);

  const loginRedirectPath = useMemo(
    () => `/auth/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`,
    [location.pathname, location.search]
  );

  useEffect(() => {
    if (!isValidUserTab(tab)) {
      navigate(`/u/${encodeURIComponent(decodedOwner)}/repositories`, { replace: true });
    }
  }, [decodedOwner, navigate, tab]);

  useEffect(() => {
    setOwnerInput(decodedOwner);
    setStoredOwner(decodedOwner);
  }, [decodedOwner]);

  useEffect(() => {
    setRepoFilter(queryFilter);
  }, [queryFilter]);

  const filteredRepos = useMemo(() => {
    const filter = repoFilter.trim().toLowerCase();
    if (!filter) {
      return repos;
    }
    return repos.filter((repo) => repo.name.toLowerCase().includes(filter));
  }, [repoFilter, repos]);

  const loadRepos = useCallback(async () => {
    if (!decodedOwner) {
      setRepos([]);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const data = await listRepos(decodedOwner);
      setRepos(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [decodedOwner]);

  useEffect(() => {
    loadRepos();
  }, [loadRepos]);

  const handleOwnerApply = () => {
    const nextOwner = ownerInput.trim();
    if (!nextOwner) {
      return;
    }
    setStoredOwner(nextOwner);
    const querySuffix = repoFilter.trim() ? `?q=${encodeURIComponent(repoFilter.trim())}` : "";
    navigate(`/u/${encodeURIComponent(nextOwner)}/${tab}${querySuffix}`);
  };

  const handleOwnerKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleOwnerApply();
    }
  };

  const getNamespaceErrorMessage = () => {
    const username = getAuthUser()?.username || "your-user";
    return `You can only modify repositories in your own namespace (${username}).`;
  };

  const ensureMutationAccess = () => {
    const token = getAuthToken();
    const authUser = getAuthUser();
    if (!token || !authUser?.username) {
      clearAuthSession();
      navigate(loginRedirectPath);
      return false;
    }

    if (authUser.username !== decodedOwner) {
      setError(getNamespaceErrorMessage());
      return false;
    }

    return true;
  };

  const resolveMutationError = (err) => {
    const status = err && typeof err === "object" ? err.status : undefined;
    const message = err instanceof Error ? err.message : "Request failed";

    if (status === 401 || message.toLowerCase().includes("invalid authentication token")) {
      clearAuthSession();
      navigate(loginRedirectPath);
      return "Session expired. Please sign in again.";
    }

    if (message.toLowerCase().includes("own namespace")) {
      return getNamespaceErrorMessage();
    }
    return message;
  };

  const handleCreateRepo = async (event) => {
    event.preventDefault();
    const cleanName = newRepoName.trim();
    if (!decodedOwner || !cleanName) {
      return;
    }
    if (!ensureMutationAccess()) {
      return;
    }

    setError("");
    setInfo("");

    try {
      await createRepo(decodedOwner, cleanName);
      setNewRepoName("");
      setInfo(`Repository ${decodedOwner}/${cleanName} created.`);
      await loadRepos();
    } catch (err) {
      setError(resolveMutationError(err));
    }
  };

  const handleDeleteRepo = (repoName) => {
    if (!ensureMutationAccess()) {
      return;
    }

    setDeleteTarget(repoName);
    setConfirmDeleteOpen(true);
  };

  const closeDeleteDialog = () => {
    if (busyAction === "delete") {
      return;
    }
    setDeleteTarget("");
    setConfirmDeleteOpen(false);
  };

  const confirmDeleteRepo = async () => {
    if (!deleteTarget) {
      return;
    }
    const repoName = deleteTarget;

    setBusyRepo(repoName);
    setBusyAction("delete");
    setError("");
    setInfo("");

    try {
      await deleteRepo(decodedOwner, repoName);
      setInfo(`Repository ${decodedOwner}/${repoName} deleted.`);
      await loadRepos();
    } catch (err) {
      setError(resolveMutationError(err));
    } finally {
      setBusyRepo("");
      setBusyAction("");
      setDeleteTarget("");
      setConfirmDeleteOpen(false);
    }
  };

  const handleGenerateReadme = async (repoName) => {
    if (!ensureMutationAccess()) {
      return;
    }

    setBusyRepo(repoName);
    setBusyAction("generate");
    setError("");
    setInfo("");

    try {
      const result = await triggerAiReadme(decodedOwner, repoName);
      setInfo(`README generation queued for ${repoName}. Job ID: ${result.job_id}`);
    } catch (err) {
      setError(resolveMutationError(err));
    } finally {
      setBusyRepo("");
      setBusyAction("");
    }
  };

  const handleOpenRepo = (repoName) => {
    navigate(`/repo/${encodeURIComponent(decodedOwner)}/${encodeURIComponent(repoName)}/code`);
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
    } catch (err) {
      const message = resolveMutationError(err);
      setBuildError(message);
      setError(message);
    } finally {
      setBuildSubmitting(false);
    }
  };

  const handleRepoFilterChange = (value) => {
    setRepoFilter(value);
    const nextParams = new URLSearchParams(searchParams);
    if (value.trim()) {
      nextParams.set("q", value);
    } else {
      nextParams.delete("q");
    }
    setSearchParams(nextParams, { replace: true });
  };

  const renderTabContent = () => {
    if (tab === "overview") {
      return (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-md border border-gh-border bg-gh-panel p-4">
              <p className="text-xs uppercase tracking-wide text-gh-muted">Repositories</p>
              <p className="mt-2 text-3xl font-semibold text-gh-text">{repos.length}</p>
            </div>
            <div className="rounded-md border border-gh-border bg-gh-panel p-4">
              <p className="text-xs uppercase tracking-wide text-gh-muted">Visible Owner</p>
              <p className="mt-2 text-xl font-semibold text-gh-text">{decodedOwner}</p>
            </div>
            <div className="rounded-md border border-gh-border bg-gh-panel p-4">
              <p className="text-xs uppercase tracking-wide text-gh-muted">Quick Action</p>
              <Link
                to={`/u/${encodeURIComponent(decodedOwner)}/repositories`}
                className="mt-2 inline-block text-sm font-semibold text-gh-accent hover:underline"
              >
                Go to repositories
              </Link>
            </div>
          </div>

          <div className="rounded-md border border-gh-border bg-gh-panel p-4">
            <h2 className="text-sm font-semibold text-gh-text">Recent repositories</h2>
            {repos.length === 0 ? (
              <p className="mt-2 text-sm text-gh-muted">No repositories yet.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {repos.slice(0, 5).map((repo) => (
                  <li key={repo.name}>
                    <button
                      type="button"
                      onClick={() => handleOpenRepo(repo.name)}
                      className="font-semibold text-gh-accent hover:underline"
                    >
                      {repo.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      );
    }

    if (tab === "repositories") {
      return (
        <div className="space-y-4">
          <div className="rounded-md border border-gh-border bg-gh-panel p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <input
                value={repoFilter}
                onChange={(event) => handleRepoFilterChange(event.target.value)}
                placeholder="Find a repository..."
                className="w-full rounded-md border border-gh-border bg-gh-bg px-3 py-2 text-sm text-gh-text outline-none ring-gh-accent focus:ring-1"
              />

              <form onSubmit={handleCreateRepo} className="flex w-full gap-2 xl:max-w-2xl">
                <input
                  value={newRepoName}
                  onChange={(event) => setNewRepoName(event.target.value)}
                  placeholder="new-repository-name"
                  className="w-full rounded-md border border-gh-border bg-gh-bg px-3 py-2 text-sm text-gh-text outline-none ring-gh-accent focus:ring-1"
                />
                {canBuildWithAi ? (
                  <button type="button" onClick={openBuildDialog} className="gh-btn-primary rounded-md px-4 py-2 text-sm font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      {/* <ShithubIcon className="h-3.5 w-3.5" /> */}
                      <span>sh*tAI</span>
                    </span>
                  </button>
                ) : null}
                <button
                  type="submit"
                  disabled={!decodedOwner || !newRepoName.trim()}
                  className="gh-btn-primary rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  New
                </button>
              </form>
            </div>
          </div>

          {isLoading ? (
            <div className="rounded-md border border-gh-border bg-gh-panel p-4 text-sm text-gh-muted">Loading repositories...</div>
          ) : (
            <RepoTable
              owner={decodedOwner}
              repos={filteredRepos}
              onOpen={handleOpenRepo}
              onGenerateReadme={handleGenerateReadme}
              onDelete={handleDeleteRepo}
              busyRepo={busyRepo}
              busyAction={busyAction}
            />
          )}
        </div>
      );
    }

    return (
      <EmptyStatePanel
        title={`${tab.charAt(0).toUpperCase()}${tab.slice(1)} is available, but there is no backend data yet.`}
        description="Routing and navigation are fully functional for this tab. This section is intentionally empty until backend support is added."
      />
    );
  };

  return (
    <section className="space-y-4">
      <UserTabNav owner={decodedOwner} />

      <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-md border border-gh-border bg-gh-panel p-4">
            <div className="mx-auto h-52 w-52 rounded-full border border-gh-border bg-[radial-gradient(circle_at_50%_50%,#7ee787_0%,#7ee787_34%,#818b98_35%,#818b98_100%)]" />
            <h1 className="mt-4 text-3xl font-bold text-gh-text">{decodedOwner || "owner"}</h1>
            <p className="text-xl text-gh-muted">{decodedOwner || "owner-handle"}</p>
            <Link
              to={`/u/${encodeURIComponent(decodedOwner)}/profile`}
              className="gh-btn mt-4 block w-full rounded-md px-3 py-2 text-center text-sm font-medium"
            >
              Edit profile
            </Link>
            <p className="mt-3 text-sm text-gh-muted">2 followers - 0 following</p>
          </div>

          <div className="rounded-md border border-gh-border bg-gh-panel p-4">
            <h2 className="text-sm font-semibold text-gh-text">Owner Namespace</h2>
            <p className="mt-1 text-xs text-gh-muted">All actions run for this owner route.</p>
            <div className="mt-3 flex gap-2">
              <input
                value={ownerInput}
                onChange={(event) => setOwnerInput(event.target.value)}
                onKeyDown={handleOwnerKeyDown}
                placeholder="e.g. honey"
                className="w-full rounded-md border border-gh-border bg-gh-bg px-3 py-2 text-sm text-gh-text outline-none ring-gh-accent focus:ring-1"
              />
              <button type="button" onClick={handleOwnerApply} className="gh-btn rounded-md px-3 py-2 text-sm font-semibold">
                Apply
              </button>
            </div>
          </div>
        </aside>

        <div className="space-y-4">
          {error ? <p className="rounded-md border border-gh-danger/40 bg-gh-danger/10 p-3 text-sm text-gh-danger">{error}</p> : null}
          {info ? <p className="rounded-md border border-gh-success/40 bg-gh-success/10 p-3 text-sm text-[#7ee787]">{info}</p> : null}
          {renderTabContent()}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDeleteOpen}
        title="Delete repository?"
        description={deleteTarget ? `This will permanently delete ${decodedOwner}/${deleteTarget}. This action cannot be undone.` : ""}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteRepo}
        onCancel={closeDeleteDialog}
        loading={busyAction === "delete"}
      />

      <BuildWithAiDialog
        isOpen={buildDialogOpen}
        owner={decodedOwner}
        repoOptions={repos}
        defaultRepo={repos[0]?.name || ""}
        loadingRepos={isLoading}
        submitting={buildSubmitting}
        error={buildError}
        info=""
        onClose={closeBuildDialog}
        onSubmit={handleBuildSubmit}
      />
    </section>
  );
}

export default HomePage;
