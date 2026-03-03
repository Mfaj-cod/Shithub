import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { getMe } from "./api/client";
import Layout from "./components/Layout";
import BugAiPage from "./pages/BugAiPage";
import HomePage from "./pages/HomePage";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import RegisterPage from "./pages/RegisterPage";
import RepoPage from "./pages/RepoPage";
import {
  AUTH_USER_CHANGED_EVENT,
  clearAuthSession,
  getAuthToken,
  getAuthUser,
  setAuthUser
} from "./utils/authStorage";
import { getStoredOwner } from "./utils/ownerStorage";

function getSessionUsername() {
  return getAuthUser()?.username || getStoredOwner() || "honey";
}

function RootRoute({ authChecked, isAuthed }) {
  if (!authChecked) {
    return <AuthCheckingScreen />;
  }

  return <LandingPage isAuthenticated={isAuthed} />;
}

function AuthCheckingScreen() {
  return (
    <div className="rounded-md border border-gh-border bg-gh-panel p-4 text-sm text-gh-muted">
      Validating session...
    </div>
  );
}

function ProtectedRoute({ children, authChecked, isAuthed }) {
  if (!authChecked) {
    return <AuthCheckingScreen />;
  }

  if (!isAuthed) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function GuestRoute({ children, authChecked, isAuthed }) {
  if (!authChecked) {
    return <AuthCheckingScreen />;
  }

  if (isAuthed) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function UserDefaultRedirect() {
  const { owner = getSessionUsername() } = useParams();
  return <Navigate to={`/u/${owner}/repositories`} replace />;
}

function RepoDefaultRedirect() {
  const { owner = "", name = "" } = useParams();
  return <Navigate to={`/repo/${owner}/${name}/code`} replace />;
}

function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const bootstrapAuth = async () => {
      const token = getAuthToken();
      const localUser = getAuthUser();

      if (!token) {
        if (!isCancelled) {
          clearAuthSession();
          setIsAuthed(false);
          setAuthChecked(true);
        }
        return;
      }

      if (localUser?.username) {
        if (!isCancelled) {
          setIsAuthed(true);
          setAuthChecked(true);
        }
        return;
      } else {
        try {
          const me = await getMe({ skipAuthInvalidEvent: true });
          if (isCancelled) {
            return;
          }

          setAuthUser({
            username: me.username,
            email: me.email,
            avatar_url: me.avatar_url ?? null
          });
          setIsAuthed(true);
        } catch (err) {
          if (isCancelled) {
            return;
          }

          const status = err && typeof err === "object" ? err.status : undefined;
          if (status === 401) {
            clearAuthSession();
            setIsAuthed(false);
          } else {
            setIsAuthed(false);
          }
        } finally {
          if (!isCancelled) {
            setAuthChecked(true);
          }
        }
        return;
      }
    };

    bootstrapAuth();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    const syncAuthStateFromStorage = () => {
      const token = getAuthToken();
      const localUser = getAuthUser();
      setIsAuthed(Boolean(token && localUser?.username));
    };

    window.addEventListener(AUTH_USER_CHANGED_EVENT, syncAuthStateFromStorage);
    return () => {
      window.removeEventListener(AUTH_USER_CHANGED_EVENT, syncAuthStateFromStorage);
    };
  }, []);

  const authProps = useMemo(
    () => ({
      authChecked,
      isAuthed
    }),
    [authChecked, isAuthed]
  );

  return (
    <Layout authChecked={authChecked} isAuthed={isAuthed}>
      <Routes>
        <Route path="/" element={<RootRoute {...authProps} />} />
        <Route
          path="/auth/login"
          element={
            <GuestRoute {...authProps}>
              <LoginPage />
            </GuestRoute>
          }
        />
        <Route
          path="/auth/register"
          element={
            <GuestRoute {...authProps}>
              <RegisterPage />
            </GuestRoute>
          }
        />
        <Route
          path="/bugai"
          element={
            <ProtectedRoute {...authProps}>
              <BugAiPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/u/:owner"
          element={
            <ProtectedRoute {...authProps}>
              <UserDefaultRedirect />
            </ProtectedRoute>
          }
        />
        <Route
          path="/u/:owner/profile"
          element={
            <ProtectedRoute {...authProps}>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/u/:owner/:tab"
          element={
            <ProtectedRoute {...authProps}>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/repo/:owner/:name"
          element={
            <ProtectedRoute {...authProps}>
              <RepoDefaultRedirect />
            </ProtectedRoute>
          }
        />
        <Route
          path="/repo/:owner/:name/:tab"
          element={
            <ProtectedRoute {...authProps}>
              <RepoPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<RootRoute {...authProps} />} />
      </Routes>
    </Layout>
  );
}

export default App;
