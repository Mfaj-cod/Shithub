function EmptyStatePanel({ title, description }) {
  return (
    <div className="rounded-md border border-dashed border-gh-border bg-gh-panel p-10 text-center">
      <h2 className="text-lg font-semibold text-gh-text">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-gh-muted">{description}</p>
    </div>
  );
}

export default EmptyStatePanel;
