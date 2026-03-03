import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AUTH_INVALID_EVENT, listRepos, triggerAiBuild } from "../api/client";
import BuildWithAiDialog from "./BuildWithAiDialog";
import ShithubIcon from "./ShithubIcon";
import { AUTH_USER_CHANGED_EVENT, clearAuthSession, getAuthUser } from "../utils/authStorage";
import { getStoredOwner } from "../utils/ownerStorage";

const GLOBAL_ITEMS = [
  { key: "new", icon: "+", title: "Create" },
  { key: "notifications", icon: "o", title: "Notifications" },
  { key: "pulls", icon: "<>", title: "Pull requests" },
  { key: "inbox", icon: "[]", title: "Inbox" }
];

function resolveHeaderContext(pathname) {
  const parts = pathname.split("/").filter(Boolean);

  if (parts.length >= 3 && parts[0] === "repo") {
    return {
      type: "repo",
      owner: decodeURIComponent(parts[1]),
      name: decodeURIComponent(parts[2])
    };
  }

  if (parts.length >= 2 && parts[0] === "u") {
    return {
      type: "user",
      owner: decodeURIComponent(parts[1]),
      name: ""
    };
  }

  return {
    type: "public",
    owner: getStoredOwner() || "honey",
    name: ""
  };
}

function Layout({ children, authChecked = false, isAuthed = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [, setAuthUserRefreshVersion] = useState(0);
  const rawAuthUser = getAuthUser();
  const authUser = authChecked && isAuthed ? rawAuthUser : null;
  const context = resolveHeaderContext(location.pathname);
  const isLanding = location.pathname === "/";
  const isAuthPage = location.pathname.startsWith("/auth/");
  const isPublicShell = isLanding || isAuthPage;
  const isRepoPage = context.type === "repo";
  const currentOwner = context.owner || getStoredOwner() || "honey";
  const profileOwner = authUser?.username || currentOwner;
  const nextPath = `${location.pathname}${location.search}`;
  const profilePath = authUser
    ? `/u/${encodeURIComponent(profileOwner)}/profile`
    : `/auth/login?next=${encodeURIComponent(nextPath)}`;
  const avatarLabel = (profileOwner?.[0] || "U").toUpperCase();
  const avatarUrl = authUser?.avatar_url || "";

  const [searchInput, setSearchInput] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarRepos, setSidebarRepos] = useState([]);
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const [isBuildDialogOpen, setIsBuildDialogOpen] = useState(false);
  const [buildRepos, setBuildRepos] = useState([]);
  const [buildDefaultRepo, setBuildDefaultRepo] = useState("");
  const [buildLoadingRepos, setBuildLoadingRepos] = useState(false);
  const [buildSubmitting, setBuildSubmitting] = useState(false);
  const [buildError, setBuildError] = useState("");
  const [buildInfo, setBuildInfo] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const query = params.get("q") || "";
    setSearchInput(query);
  }, [location.search]);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const handleAuthInvalid = () => {
      setIsBuildDialogOpen(false);
      const isPublicRoute = location.pathname === "/" || location.pathname.startsWith("/auth/");
      if (isPublicRoute) {
        return;
      }
      navigate(`/auth/login?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
    };

    window.addEventListener(AUTH_INVALID_EVENT, handleAuthInvalid);
    return () => window.removeEventListener(AUTH_INVALID_EVENT, handleAuthInvalid);
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    const handleAuthUserChanged = () => {
      setAuthUserRefreshVersion((value) => value + 1);
    };

    window.addEventListener(AUTH_USER_CHANGED_EVENT, handleAuthUserChanged);
    return () => window.removeEventListener(AUTH_USER_CHANGED_EVENT, handleAuthUserChanged);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadSidebarRepos = async () => {
      if (!isSidebarOpen || !authUser?.username) {
        return;
      }

      setSidebarLoading(true);
      try {
        const data = await listRepos(authUser.username);
        if (!cancelled) {
          setSidebarRepos(data.slice(0, 8));
        }
      } catch {
        if (!cancelled) {
          setSidebarRepos([]);
        }
      } finally {
        if (!cancelled) {
          setSidebarLoading(false);
        }
      }
    };

    loadSidebarRepos();

    return () => {
      cancelled = true;
    };
  }, [authUser?.username, isSidebarOpen]);

  useEffect(() => {
    let cancelled = false;

    const loadBuildRepos = async () => {
      if (!isBuildDialogOpen || !authUser?.username) {
        return;
      }

      setBuildLoadingRepos(true);
      setBuildError("");
      setBuildInfo("");

      try {
        const data = await listRepos(authUser.username);
        if (cancelled) {
          return;
        }

        setBuildRepos(data);
        const repoFromContext = context.type === "repo" && context.owner === authUser.username ? context.name : "";
        setBuildDefaultRepo(repoFromContext || data[0]?.name || "");
      } catch (err) {
        if (!cancelled) {
          setBuildRepos([]);
          setBuildDefaultRepo("");
          setBuildError(err?.message || "Failed to load repositories");
        }
      } finally {
        if (!cancelled) {
          setBuildLoadingRepos(false);
        }
      }
    };

    loadBuildRepos();

    return () => {
      cancelled = true;
    };
  }, [authUser?.username, context.name, context.owner, context.type, isBuildDialogOpen]);

  const sidebarPrimary = useMemo(() => {
    if (!authUser?.username) {
      return [
        { label: "Home", to: "/" },
        { label: "bugAI", to: "/auth/login" },
        { label: "Repositories", to: "/auth/login" },
        { label: "Projects", to: "/auth/login" },
        { label: "Issues", to: "/auth/login" },
        { label: "Pull requests", to: "/auth/login" }
      ];
    }

    const owner = encodeURIComponent(authUser.username);
    return [
      { label: "Home", to: "/" },
      { label: "bugAI", to: "/bugai" },
      { label: "Issues", to: `/u/${owner}/overview` },
      { label: "Pull requests", to: `/u/${owner}/overview` },
      { label: "Repositories", to: `/u/${owner}/repositories` },
      { label: "Projects", to: `/u/${owner}/projects` },
      { label: "Discussions", to: `/u/${owner}/overview` },
      { label: "Codespaces", to: `/u/${owner}/overview` }
    ];
  }, [authUser?.username]);

  const sidebarSecondary = [
    { label: "Explore", to: "/" },
    { label: "Marketplace", to: "/" },
    { label: "MCP registry", to: "/" }
  ];

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    const query = searchInput.trim();
    if (!authUser) {
      navigate(`/auth/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }

    const base = `/u/${encodeURIComponent(currentOwner)}/repositories`;
    if (!query) {
      navigate(base);
      return;
    }
    navigate(`${base}?q=${encodeURIComponent(query)}`);
  };

  const handleLogout = () => {
    clearAuthSession();
    navigate("/auth/login");
  };
  const handleSidebarLogout = () => {
    setIsSidebarOpen(false);
    handleLogout();
  };

  const openBuildDialog = () => {
    setBuildError("");
    setBuildInfo("");
    setIsBuildDialogOpen(true);
  };

  const closeBuildDialog = () => {
    if (buildSubmitting) {
      return;
    }
    setIsBuildDialogOpen(false);
  };

  const handleBuildSubmit = async (repoName, prompt) => {
    if (!authUser?.username) {
      navigate(`/auth/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }

    setBuildSubmitting(true);
    setBuildError("");
    setBuildInfo("");

    try {
      const result = await triggerAiBuild(authUser.username, repoName, prompt);
      setBuildInfo(`Build queued for ${authUser.username}/${repoName}. Job ID: ${result.job_id}`);
      setIsBuildDialogOpen(false);
      navigate(`/repo/${encodeURIComponent(authUser.username)}/${encodeURIComponent(repoName)}/actions`, {
        state: { flashInfo: `Build queued. Job ID: ${result.job_id}` }
      });
    } catch (err) {
      setBuildError(err?.message || "Failed to queue build job");
    } finally {
      setBuildSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gh-bg text-gh-text">
      <header className="sticky top-0 z-40 border-b border-gh-border bg-[#010409]/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gh-border bg-gh-button text-sm font-semibold text-gh-muted hover:text-gh-text"
            aria-label="Open sidebar"
          >
            |||
          </button>

          <Link to="/" className="flex items-center gap-2 text-gh-text">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gh-border bg-[#0d1117] text-sm font-bold">
              <ShithubIcon className="h-4 w-4" />
            </span>
            <span className="text-[28px] font-semibold tracking-tight">Sh*thub</span>
          </Link>

          {context.type === "repo" ? (
            <div className="hidden items-center gap-2 border-l border-gh-border pl-3 text-sm md:flex">
              <Link to={`/u/${encodeURIComponent(context.owner)}/repositories`} className="font-semibold text-gh-text hover:text-gh-accent">
                {context.owner}
              </Link>
              <span className="text-gh-muted">/</span>
              <span className="font-semibold text-gh-text">{context.name}</span>
            </div>
          ) : null}

          <div className="ml-2 hidden flex-1 items-center lg:flex">
            <form onSubmit={handleSearchSubmit} className="relative w-full max-w-[520px]">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gh-muted">Q</span>
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={isPublicShell ? "Type / to search" : isRepoPage ? "Type / to search this owner" : "Type / to search"}
                className="w-full rounded-md border border-gh-border bg-gh-bg py-2 pl-8 pr-16 text-sm text-gh-text outline-none ring-gh-accent focus:ring-1"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-gh-border bg-gh-panel px-1.5 py-0.5 text-[10px] text-gh-muted">
                /
              </span>
            </form>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {!isPublicShell && authUser
              ? (
                  <Link to="/bugai" className="gh-btn rounded-md px-3 py-1.5 text-xs font-semibold">
                    bugAI
                  </Link>
                )
              : null}
            {!isPublicShell && authUser
              ? (
                  <button
                    type="button"
                    onClick={openBuildDialog}
                    className="gh-btn-primary rounded-md px-3 py-1.5 text-xs font-semibold"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {/* <ShithubIcon className="h-3.5 w-3.5" /> */}
                      <span>sh*tAI</span>
                    </span>
                  </button>
                )
              : null}
            {!isPublicShell && authUser
              ? GLOBAL_ITEMS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    title={item.title}
                    className="inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-gh-border bg-gh-button px-2 text-xs font-semibold text-gh-muted hover:text-gh-text"
                  >
                    {item.icon}
                  </button>
                ))
              : null}
            {isPublicShell && !authUser ? (
              <>
                <Link to="/auth/login" className="gh-btn rounded-md px-3 py-1.5 text-sm font-semibold">
                  Login
                </Link>
                <Link to="/auth/register" className="gh-btn-primary rounded-md px-3 py-1.5 text-sm font-semibold">
                  Sign up
                </Link>
              </>
            ) : isPublicShell && authUser ? (
              <>
                <Link to="/bugai" className="gh-btn rounded-md px-3 py-1.5 text-sm font-semibold">
                  bugAI
                </Link>
                <button
                  type="button"
                  onClick={openBuildDialog}
                  className="gh-btn-primary rounded-md px-3 py-1.5 text-sm font-semibold"
                >
                  <span className="inline-flex items-center gap-1.5">
                    {/* <ShithubIcon className="h-3.5 w-3.5" /> */}
                    <span>sh*tAI</span>
                  </span>
                </button>
                <Link
                  to={`/u/${encodeURIComponent(authUser.username)}/repositories`}
                  className="gh-btn rounded-md px-3 py-1.5 text-sm font-semibold"
                >
                  Repositories
                </Link>
                <Link
                  to={profilePath}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-gh-border bg-gh-panel pl-1 pr-3 text-xs font-semibold hover:border-gh-accent hover:text-gh-accent"
                  title={`Open ${profileOwner} profile`}
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-gh-border bg-gh-bg">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={`${profileOwner} avatar`} className="h-full w-full object-cover" />
                    ) : (
                      avatarLabel
                    )}
                  </span>
                  <span className="text-sm">{profileOwner}</span>
                </Link>
              </>
            ) : (
              <div className="relative">
                <Link
                  to={profilePath}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gh-border bg-gh-panel text-xs font-semibold hover:border-gh-accent hover:text-gh-accent"
                  title={authUser ? `Open ${profileOwner} profile` : "Sign in"}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={`${profileOwner} avatar`} className="h-full w-full rounded-full object-cover" />
                  ) : (
                    avatarLabel
                  )}
                </Link>
                <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border border-[#010409] bg-[#2f81f7]" />
              </div>
            )}
          </div>
        </div>
      </header>

      {isSidebarOpen ? (
        <div className="fixed inset-0 z-50 bg-black/65" onClick={() => setIsSidebarOpen(false)}>
          <aside
            className="flex h-full w-[340px] flex-col border-r border-gh-border bg-[#0b1118] p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="mb-4 flex items-center justify-between">
                <Link to="/" className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gh-border bg-gh-bg text-sm font-bold">
                  <ShithubIcon className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gh-border bg-gh-button text-xs font-semibold text-gh-muted hover:text-gh-text"
                >
                  X
                </button>
              </div>

              <nav className="space-y-1">
                {sidebarPrimary.map((item) => (
                  <Link
                    key={item.label}
                    to={item.to}
                    className="block rounded-md px-3 py-2 text-[22px] font-medium leading-7 text-gh-text hover:bg-gh-panel"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              <div className="my-4 border-t border-gh-border" />

              <nav className="space-y-1">
                {sidebarSecondary.map((item) => (
                  <Link
                    key={item.label}
                    to={item.to}
                    className="block rounded-md px-3 py-2 text-[22px] font-medium leading-7 text-gh-text hover:bg-gh-panel"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              <div className="my-4 border-t border-gh-border" />

              <div className="space-y-2 px-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gh-muted">Top repositories</h3>
                  <span className="text-gh-muted">Q</span>
                </div>

                {!authUser ? (
                  <p className="text-sm text-gh-muted">Sign in to see your repositories.</p>
                ) : sidebarLoading ? (
                  <p className="text-sm text-gh-muted">Loading repositories...</p>
                ) : sidebarRepos.length === 0 ? (
                  <p className="text-sm text-gh-muted">No repositories yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {sidebarRepos.map((repo) => (
                      <li key={repo.name}>
                        <Link
                          to={`/repo/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/code`}
                          className="block rounded-md px-2 py-1.5 text-sm text-gh-text hover:bg-gh-panel"
                        >
                          {repo.owner}/{repo.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {authUser ? (
              <div className="mt-4 border-t border-gh-border pt-4">
                <button
                  type="button"
                  onClick={handleSidebarLogout}
                  className="gh-btn w-full rounded-md px-3 py-2 text-sm font-semibold"
                >
                  Logout
                </button>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}

      <BuildWithAiDialog
        isOpen={isBuildDialogOpen}
        owner={authUser?.username || ""}
        repoOptions={buildRepos}
        defaultRepo={buildDefaultRepo}
        loadingRepos={buildLoadingRepos}
        submitting={buildSubmitting}
        error={buildError}
        info={buildInfo}
        onClose={closeBuildDialog}
        onSubmit={handleBuildSubmit}
      />

      <main className="mx-auto w-full max-w-[1600px] px-4 py-6">{children}</main>
    </div>
  );
}

export default Layout;
