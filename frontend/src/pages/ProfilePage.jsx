import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { listRepos, removeMyAvatar, uploadMyAvatar } from "../api/client";
import { clearAuthSession, getAuthUser, setAuthUser } from "../utils/authStorage";

function ProfilePage() {
  const navigate = useNavigate();
  const { owner = "honey" } = useParams();
  const decodedOwner = useMemo(() => decodeURIComponent(owner), [owner]);
  const authUser = getAuthUser();
  const isOwnProfile = authUser?.username === decodedOwner;
  const [avatarUrl, setAvatarUrl] = useState(isOwnProfile ? authUser?.avatar_url || "" : "");
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [avatarUpdating, setAvatarUpdating] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarInfo, setAvatarInfo] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await listRepos(decodedOwner);
        if (!cancelled) {
          setRepos(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [decodedOwner]);

  useEffect(() => {
    if (!isOwnProfile) {
      setAvatarUrl("");
      return;
    }
    setAvatarUrl(authUser?.avatar_url || "");
  }, [authUser?.avatar_url, isOwnProfile]);

  const recentRepos = repos.slice(0, 6);
  const avatarLabel = (decodedOwner?.[0] || "U").toUpperCase();
  const handleLogout = () => {
    clearAuthSession();
    navigate("/auth/login");
  };

  const triggerAvatarPicker = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setAvatarUpdating(true);
    setAvatarError("");
    setAvatarInfo("");
    try {
      const response = await uploadMyAvatar(file);
      if (response?.user) {
        setAuthUser(response.user);
        setAvatarUrl(response.user.avatar_url || "");
      }
      setAvatarInfo("Profile picture updated.");
    } catch (err) {
      setAvatarError(err?.message || "Failed to upload profile picture.");
    } finally {
      setAvatarUpdating(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarUpdating(true);
    setAvatarError("");
    setAvatarInfo("");
    try {
      const response = await removeMyAvatar();
      if (response?.user) {
        setAuthUser(response.user);
        setAvatarUrl(response.user.avatar_url || "");
      }
      setAvatarInfo("Profile picture removed.");
    } catch (err) {
      setAvatarError(err?.message || "Failed to remove profile picture.");
    } finally {
      setAvatarUpdating(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-md border border-gh-border bg-gh-panel p-5">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={`${decodedOwner} avatar`}
                className="mx-auto h-52 w-52 rounded-full border border-gh-border object-cover"
              />
            ) : (
              <div className="mx-auto flex h-52 w-52 items-center justify-center rounded-full border border-gh-border bg-gh-panelAlt text-7xl font-bold text-gh-muted">
                {avatarLabel}
              </div>
            )}
            <h1 className="mt-4 text-3xl font-bold text-gh-text">{decodedOwner}</h1>
            <p className="text-xl text-gh-muted">{decodedOwner}</p>
            {isOwnProfile ? (
              <div className="mt-4 space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
                <button
                  type="button"
                  onClick={triggerAvatarPicker}
                  disabled={avatarUpdating}
                  className="gh-btn w-full rounded-md px-3 py-2 text-sm font-medium disabled:opacity-60"
                >
                  {avatarUrl ? "Change profile picture" : "Upload profile picture"}
                </button>
                {avatarUrl ? (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={avatarUpdating}
                    className="gh-btn w-full rounded-md px-3 py-2 text-sm font-medium text-gh-danger disabled:opacity-60"
                  >
                    Remove picture
                  </button>
                ) : null}
                {avatarError ? <p className="rounded-md border border-gh-danger/40 bg-gh-danger/10 p-2 text-xs text-gh-danger">{avatarError}</p> : null}
                {avatarInfo ? <p className="rounded-md border border-gh-success/40 bg-gh-success/10 p-2 text-xs text-[#7ee787]">{avatarInfo}</p> : null}
              </div>
            ) : null}
            {/* <p className="mt-3 text-sm text-gh-muted">2 followers - 0 following</p> */}
          </div>

          <div className="rounded-md border border-gh-border bg-gh-panel p-4">
            <h2 className="text-sm font-semibold text-gh-text">Profile Links</h2>
            <div className="mt-3 space-y-2 text-sm">
              <Link to={`/u/${encodeURIComponent(decodedOwner)}/overview`} className="block text-gh-accent hover:underline">
                Overview
              </Link>
              <Link to={`/u/${encodeURIComponent(decodedOwner)}/repositories`} className="block text-gh-accent hover:underline">
                Repositories
              </Link>
              <Link to={`/u/${encodeURIComponent(decodedOwner)}/stars`} className="block text-gh-accent hover:underline">
                Stars
              </Link>
            </div>

            <div className="mt-4 border-t border-gh-border pt-4">
              <button type="button" onClick={handleLogout} className="gh-btn w-full rounded-md px-3 py-2 text-sm font-semibold">
                Logout
              </button>
            </div>
          </div>
        </aside>

        <div className="space-y-4">
          <div className="rounded-md border border-gh-border bg-gh-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gh-text">Pinned</h2>
              <Link to={`/u/${encodeURIComponent(decodedOwner)}/repositories`} className="text-sm font-semibold text-gh-accent hover:underline">
                View all repositories
              </Link>
            </div>
          </div>

          {error ? <p className="rounded-md border border-gh-danger/40 bg-gh-danger/10 p-3 text-sm text-gh-danger">{error}</p> : null}

          {loading ? (
            <div className="rounded-md border border-gh-border bg-gh-panel p-4 text-sm text-gh-muted">Loading profile repositories...</div>
          ) : recentRepos.length === 0 ? (
            <div className="rounded-md border border-dashed border-gh-border bg-gh-panel p-8 text-center text-sm text-gh-muted">
              No repositories available for this profile.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {recentRepos.map((repo) => (
                <div key={repo.name} className="rounded-md border border-gh-border bg-gh-panel p-4">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/repo/${encodeURIComponent(decodedOwner)}/${encodeURIComponent(repo.name)}/code`}
                      className="truncate text-lg font-semibold text-gh-accent hover:underline"
                    >
                      {repo.name}
                    </Link>
                    <span className="rounded-full border border-gh-border px-2 py-0.5 text-xs text-gh-muted">Public</span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-gh-muted">{repo.path}</p>
                  <p className="mt-3 text-sm text-gh-muted">
                    <span className="mr-2 inline-block h-3 w-3 rounded-full bg-gh-accent align-middle" />
                    Hosted in Sh*thub namespace <span className="text-gh-text">{decodedOwner}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default ProfilePage;
