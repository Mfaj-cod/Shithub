const STATUS_STYLES = {
  queued: "bg-gh-warning/15 text-gh-warning border-gh-warning/40",
  running: "bg-gh-accent/15 text-gh-accent border-gh-accent/40",
  success: "bg-gh-success/15 text-gh-success border-gh-success/40",
  failed: "bg-gh-danger/15 text-gh-danger border-gh-danger/40",
  idle: "bg-gh-button text-gh-muted border-gh-border"
};

function normalizeStatus(status) {
  return String(status || "").toLowerCase();
}

function StatusPill({ status }) {
  const normalized = normalizeStatus(status);
  const style = STATUS_STYLES[normalized] || "bg-gh-button text-gh-muted border-gh-border";
  const label = status || "unknown";

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${style}`}>
      {label}
    </span>
  );
}

export default StatusPill;
