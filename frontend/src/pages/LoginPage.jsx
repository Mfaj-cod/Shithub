import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { loginStart, loginVerify, resendOtp } from "../api/client";
import { clearAuthSession, setAuthToken, setAuthUser } from "../utils/authStorage";
import { setStoredOwner } from "../utils/ownerStorage";

function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = useMemo(() => searchParams.get("next") || "", [searchParams]);

  const [step, setStep] = useState("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const redirectAfterAuth = (username) => {
    const target = nextPath || "/";
    navigate(target, { replace: true });
  };

  const buildRegisterPath = (prefillEmail = "") => {
    const params = new URLSearchParams();
    if (nextPath) {
      params.set("next", nextPath);
    }
    if (prefillEmail) {
      params.set("email", prefillEmail);
    }
    params.set("from", "login");
    const suffix = params.toString();
    return suffix ? `/auth/register?${suffix}` : "/auth/register";
  };

  const registerPath = useMemo(() => buildRegisterPath(email.trim()), [email, nextPath]);

  const handleStartLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    try {
      const data = await loginStart(email.trim(), password);
      setChallengeId(data.challenge_id);
      setStep("otp");
      setInfo("OTP generated, Check your email.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      const status = err && typeof err === "object" ? err.status : undefined;
      const shouldRegister = status === 403 || status === 404 || message.toLowerCase().includes("not verified");

      if (shouldRegister) {
        navigate(buildRegisterPath(email.trim()), { replace: true });
        return;
      }

      setError(message);
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
      const data = await loginVerify(challengeId, otp.trim());
      clearAuthSession();
      setAuthToken(data.access_token);
      setAuthUser(data.user);
      setStoredOwner(data.user.username);
      redirectAfterAuth(data.user.username);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
      <h1 className="text-2xl font-semibold text-gh-text">Sign in to Sh*thub</h1>
      <p className="text-sm text-gh-muted">Use your email/password, then verify with OTP.</p>

      {error ? <p className="rounded-md border border-gh-danger/40 bg-gh-danger/10 p-3 text-sm text-gh-danger">{error}</p> : null}
      {info ? <p className="rounded-md border border-gh-success/40 bg-gh-success/10 p-3 text-sm text-[#7ee787]">{info}</p> : null}

      {step === "credentials" ? (
        <form onSubmit={handleStartLogin} className="space-y-3">
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
              className="w-full rounded-md border border-gh-border bg-gh-bg px-3 py-2 text-sm text-gh-text outline-none ring-gh-accent focus:ring-1"
            />
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
            {loading ? "Verifying..." : "Verify and Sign In"}
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
        No account?{" "}
        <Link to={registerPath} className="font-semibold text-gh-accent hover:underline">
          Register
        </Link>
      </p>
    </section>
  );
}

export default LoginPage;
