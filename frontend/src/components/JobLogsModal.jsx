function JobLogsModal({ isOpen, onClose, loading, error, logsData }) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[80vh] w-full max-w-4xl overflow-hidden rounded-md border border-gh-border bg-gh-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-gh-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gh-text">Job Logs</h2>
            {logsData?.id ? <p className="font-mono text-xs text-gh-muted">{logsData.id}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="gh-btn rounded-md px-2 py-1 text-xs"
          >
            Close
          </button>
        </div>

        <div className="space-y-3 p-4">
          {loading ? <p className="text-sm text-gh-muted">Loading logs...</p> : null}
          {error ? <p className="text-sm text-gh-danger">{error}</p> : null}
          {!loading && !error ? (
            <pre className="max-h-[55vh] overflow-auto rounded-md border border-gh-border bg-gh-bg p-3 font-mono text-xs text-gh-text">
              {logsData?.logs || "(no logs available)"}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default JobLogsModal;
