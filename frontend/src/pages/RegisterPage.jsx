import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { registerStart, registerVerify, resendOtp, uploadMyAvatar } from "../api/client";
import { clearAuthSession, setAuthToken, setAuthUser } from "../utils/authStorage";
import { setStoredOwner } from "../utils/ownerStorage";

function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = useMemo(() => searchParams.get("next") || "", [searchParams]);
  const prefillEmail = useMemo(() => searchParams.get("email") || "", [searchParams]);
  const redirectedFromLogin = useMemo(() => searchParams.get("from") === "login", [searchParams]);
  const loginPath = nextPath ? `/auth/login?next=${encodeURIComponent(nextPath)}` : "/auth/login";

  const [step, setStep] = useState("details");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");

  useEffect(() => {
    if (prefillEmail && !email) {
      setEmail(prefillEmail);
    }
  }, [email, prefillEmail]);

  useEffect(() => {
    if (redirectedFromLogin) {
      setInfo("Complete registration and OTP verification before signing in.");
    }
  }, [redirectedFromLogin]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [avatarFile]);

  const redirectAfterAuth = (nextUsername) => {
    const target = nextPath || "/";
    navigate(target, { replace: true });
  };

  const handleStartRegister = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    try {
      const data = await registerStart(username.trim(), email.trim(), password);
      setChallengeId(data.challenge_id);
      setStep("otp");
      setInfo("OTP sent to your email.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    try {
      const data = await registerVerify(challengeId, otp.trim());
      clearAuthSession();
      setAuthToken(data.access_token);
      setAuthUser(data.user);
      setStoredOwner(data.user.username);
      if (avatarFile) {
        try {
          const avatarResult = await uploadMyAvatar(avatarFile);
          if (avatarResult?.user) {
            setAuthUser(avatarResult.user);
          }
        } catch {
          setInfo("Account created, but avatar upload failed. You can upload it later from profile.");
        }
      }
      redirectAfterAuth(data.user.username);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarSelection = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setAvatarFile(null);
      return;
    }
    setAvatarFile(file);
  };

  const clearSelectedAvatar = () => {
    setAvatarFile(null);
  };

  const handleResendOtp = async () => {
    setLoading(true);
    setError("");
    setInfo("");

    try {
      await resendOtp(challengeId);
      setInfo("New OTP sent.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-md space-y-4 rounded-md border border-gh-border bg-gh-panel p-6">
      <h1 className="text-2xl font-semibold text-gh-text">Create your Sh*thub account</h1>
      <p className="text-sm text-gh-muted">Register with username/email/password, then verify email OTP.</p>

      {error ? <p className="rounded-md border border-gh-danger/40 bg-gh-danger/10 p-3 text-sm text-gh-danger">{error}</p> : null}
      {info ? <p className="rounded-md border border-gh-success/40 bg-gh-success/10 p-3 text-sm text-[#7ee787]">{info}</p> : null}

      {step === "details" ? (
        <form onSubmit={handleStartRegister} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gh-text">Username</label>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              className="w-full rounded-md border border-gh-border bg-gh-bg px-3 py-2 text-sm text-gh-text outline-none ring-gh-accent focus:ring-1"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gh-text">Email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-md border border-gh-border bg-gh-bg px-3 py-2 text-sm text-gh-text outline-none ring-gh-accent focus:ring-1"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gh-text">Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              className="w-full rounded-md border border-gh-border bg-gh-bg px-3 py-2 text-sm text-gh-text outline-none ring-gh-accent focus:ring-1"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gh-text">Profile picture (optional)</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleAvatarSelection}
              className="block w-full cursor-pointer rounded-md border border-gh-border bg-gh-bg px-3 py-2 text-sm text-gh-muted file:mr-3 file:rounded-md file:border-0 file:bg-gh-panel file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-gh-text hover:file:bg-gh-panelAlt"
            />
            {avatarFile ? (
              <div className="mt-3 rounded-md border border-gh-border bg-gh-panelAlt p-3">
                <div className="flex items-center gap-3">
                  {avatarPreviewUrl ? (
                    <img src={avatarPreviewUrl} alt="Avatar preview" className="h-14 w-14 rounded-full border border-gh-border object-cover" />
                  ) : (
                    <div className="h-14 w-14 rounded-full border border-gh-border bg-gh-bg" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gh-text">{avatarFile.name}</p>
                    <p className="text-xs text-gh-muted">{Math.round(avatarFile.size / 1024)} KB</p>
                  </div>
                  <button type="button" onClick={clearSelectedAvatar} className="gh-btn rounded-md px-2 py-1 text-xs font-semibold">
                    Remove
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <button type="submit" disabled={loading} className="gh-btn-primary w-full rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-60">
            {loading ? "Sending OTP..." : "Continue"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gh-text">Enter OTP</label>
            <input
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              required
              maxLength={6}
              placeholder="6-digit code"
              className="w-full rounded-md border border-gh-border bg-gh-bg px-3 py-2 text-sm tracking-[0.2em] text-gh-text outline-none ring-gh-accent focus:ring-1"
            />
          </div>
          <button type="submit" disabled={loading} className="gh-btn-primary w-full rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-60">
            {loading ? "Verifying..." : "Verify and Register"}
          </button>
          <button
            type="button"
            onClick={handleResendOtp}
            disabled={loading}
            className="gh-btn w-full rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            Resend OTP
          </button>
        </form>
      )}

      <p className="text-sm text-gh-muted">
        Already have an account?{" "}
        <Link to={loginPath} className="font-semibold text-gh-accent hover:underline">
          Sign in
        </Link>
      </p>
    </section>
  );
}

export default RegisterPage;
