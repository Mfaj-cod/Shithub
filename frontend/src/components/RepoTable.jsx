function RepoTable({ owner, repos, onOpen, onGenerateReadme, onDelete, busyRepo, busyAction }) {
  if (repos.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gh-border bg-gh-panel p-8 text-center text-sm text-gh-muted">
        No repositories found for <span className="font-semibold text-gh-text">{owner}</span>.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-gh-border bg-gh-panel">
      <ul className="divide-y divide-gh-border">
        {repos.map((repo) => {
          const isBusy = busyRepo === repo.name;
          return (
            <li key={repo.name} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpen(repo.name)}
                    className="truncate text-left text-2xl font-semibold text-gh-accent hover:underline"
                  >
                    {repo.name}
                  </button>
                  <span className="rounded-full border border-gh-border px-2 py-0.5 text-xs text-gh-muted">Public</span>
                </div>

                <p className="mt-2 truncate text-sm text-gh-muted">{repo.path}</p>
                <p className="mt-2 text-sm text-gh-muted">
                  <span className="mr-2 inline-block h-3 w-3 rounded-full bg-gh-accent align-middle" />
                  Git repository in owner namespace <span className="text-gh-text">{owner}</span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <button
                  type="button"
                  onClick={() => onOpen(repo.name)}
                  disabled={isBusy}
                  className="gh-btn rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-60"
                >
                  Open
                </button>
                <button
                  type="button"
                  onClick={() => onGenerateReadme(repo.name)}
                  disabled={isBusy}
                  className="gh-btn rounded-md px-3 py-1.5 text-sm font-medium text-gh-accent disabled:opacity-60"
                >
                  {isBusy && busyAction === "generate" ? "Queuing..." : "Generate README"}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(repo.name)}
                  disabled={isBusy}
                  className="rounded-md border border-gh-danger/40 bg-gh-danger/10 px-3 py-1.5 text-sm font-medium text-gh-danger hover:bg-gh-danger/20 disabled:opacity-60"
                >
                  {isBusy && busyAction === "delete" ? "Deleting..." : "Delete"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default RepoTable;
