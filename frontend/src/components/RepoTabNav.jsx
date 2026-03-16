import { NavLink } from "react-router-dom";

const REPO_TABS = [
  { id: "code", label: "Code" },
  { id: "editor", label: "Editor" },
  { id: "issues", label: "Issues" },
  { id: "pulls", label: "Pull requests" },
  { id: "actions", label: "Actions" },
  { id: "projects", label: "Projects" },
  { id: "wiki", label: "Wiki" },
  { id: "security", label: "Security" },
  { id: "insights", label: "Insights" },
  { id: "settings", label: "Settings" }
];

function RepoTabNav({ owner, name }) {
  return (
    <div className="border-b border-gh-border">
      <nav className="flex items-center gap-6 overflow-x-auto whitespace-nowrap px-1">
        {REPO_TABS.map((tab) => (
          <NavLink
            key={tab.id}
            to={`/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${tab.id}`}
            className={({ isActive }) =>
              `border-b-2 py-3 text-sm font-semibold ${
                isActive ? "border-gh-warning text-gh-text" : "border-transparent text-gh-muted hover:text-gh-text"
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function isValidRepoTab(tab) {
  return REPO_TABS.some((item) => item.id === tab);
}

export default RepoTabNav;
