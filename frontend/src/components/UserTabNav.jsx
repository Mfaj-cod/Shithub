import { NavLink } from "react-router-dom";

const USER_TABS = [
  { id: "overview", label: "Overview" },
  { id: "repositories", label: "Repositories" },
  { id: "projects", label: "Projects" },
  { id: "packages", label: "Packages" },
  { id: "stars", label: "Stars" }
];

function UserTabNav({ owner }) {
  return (
    <div className="border-b border-gh-border">
      <nav className="flex items-center gap-6 overflow-x-auto whitespace-nowrap px-2">
        {USER_TABS.map((tab) => (
          <NavLink
            key={tab.id}
            to={`/u/${encodeURIComponent(owner)}/${tab.id}`}
            className={({ isActive }) =>
              `border-b-2 px-1 py-3 text-sm font-semibold ${
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

export function isValidUserTab(tab) {
  return USER_TABS.some((item) => item.id === tab);
}

export default UserTabNav;
