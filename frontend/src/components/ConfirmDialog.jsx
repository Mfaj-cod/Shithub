function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  loading = false
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-md border border-gh-border bg-gh-panel shadow-2xl">
        <div className="border-b border-gh-border px-4 py-3">
          <h2 className="text-base font-semibold text-gh-text">{title}</h2>
        </div>

        <div className="px-4 py-4">
          <p className="text-sm text-gh-muted">{description}</p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gh-border px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="gh-btn rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="rounded-md border border-gh-danger/50 bg-gh-danger/15 px-3 py-1.5 text-sm font-semibold text-gh-danger hover:bg-gh-danger/25 disabled:opacity-60"
          >
            {loading ? "Deleting..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
