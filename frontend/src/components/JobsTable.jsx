import StatusPill from "./StatusPill";

const IST_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatDate(dateValue) {
  if (!dateValue) {
    return "n/a";
  }
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }
  return `${IST_DATE_FORMATTER.format(date)} IST`;
}

function shortId(id) {
  if (!id) {
    return "n/a";
  }
  return id.length > 12 ? `${id.slice(0, 12)}...` : id;
}

function JobsTable({ jobs, loading, onViewLogs }) {
  if (loading) {
    return (
      <div className="rounded-md border border-gh-border bg-gh-panel p-4 text-sm text-gh-muted">
        Loading jobs...
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gh-border bg-gh-panel p-4 text-sm text-gh-muted">
        No jobs found yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-gh-border bg-gh-panel">
      <table className="min-w-full text-sm">
        <thead className="border-b border-gh-border bg-gh-bg text-left text-gh-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Job</th>
            <th className="px-4 py-3 font-medium">Task</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Created</th>
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b border-gh-border hover:bg-gh-panelAlt/70 last:border-b-0">
              <td className="px-4 py-3 font-mono text-xs text-gh-muted">{shortId(job.id)}</td>
              <td className="px-4 py-3 text-gh-text">{job.task}</td>
              <td className="px-4 py-3">
                <StatusPill status={job.status} />
              </td>
              <td className="px-4 py-3 text-xs text-gh-muted">{formatDate(job.created_at)}</td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onViewLogs(job.id)}
                  className="gh-btn rounded-md px-3 py-1.5 text-xs font-medium"
                >
                  View logs
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default JobsTable;
