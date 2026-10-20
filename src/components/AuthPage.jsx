
import { useState } from "react";
import "./AuthPage.css";

const API_BASE = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

export default function AuthPage({ onLogin, onClose }) {
  const [mode, setMode] = useState("login");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    agree: false,
  });

  const update = (event) => {
    const { name, value, checked, type } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    setError("");
    setSuccess("");
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setSuccess("");
  };

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (mode === "signup" && form.password !== form.confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }

    if (mode === "signup" && !form.agree) {
      setError("Please accept the terms to create your account.");
      return;
    }

    setLoading(true);

    try {
      const endpoint =
        mode === "login" ? "/auth/login" : "/auth/signup";

      const payload =
        mode === "login"
          ? { email: form.email, password: form.password }
          : {
              name: form.name.trim(),
              email: form.email.trim(),
              password: form.password,
            };

      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message ||
            data.error ||
            (response.status === 404
              ? "Authentication endpoint not found. Connect your backend auth routes."
              : "Unable to authenticate. Please try again.")
        );
      }

      if (mode === "signup") {
        setSuccess(
          data.message ||
            "Account created successfully. You can now sign in."
        );
        setMode("login");
        setForm((prev) => ({
          ...prev,
          name: "",
          password: "",
          confirmPassword: "",
          agree: false,
        }));
        return;
      }

      const user = data.user || data.data?.user || null;
      const token = data.token || data.data?.token || data.accessToken;

      if (token) {
        localStorage.setItem("startupiq_token", token);
      }

      if (user) {
        localStorage.setItem("startupiq_user", JSON.stringify(user));
      }

      if (onLogin) {
        onLogin({ user, token, response: data });
      } else {
        setSuccess("Login successful!");
      }
    } catch (err) {
      setError(
        err.message ||
          "Could not connect to the server. Check that your backend is running."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-showcase">
        <a className="auth-brand" href="/" onClick={(e) => {
          if (!onClose) e.preventDefault();
          else {
            e.preventDefault();
            onClose();
          }
        }}>
          <span className="auth-brand-mark">S</span>
          <span>Startup<span className="auth-brand-light">IQ</span></span>
        </a>

        <div className="auth-showcase-content">
          <span className="auth-eyebrow">
            YOUR STARTUP. YOUR NEXT CHAPTER.
          </span>
          <h1>Build something<br />that matters.</h1>
          <p>
            Find the right schemes, discover opportunities and make
            smarter decisions for your startup journey.
          </p>

          <div className="auth-feature-list">
            <div className="auth-feature">
              <span className="auth-feature-icon">↗</span>
              <div>
                <strong>Discover opportunities</strong>
                <span>Explore relevant startup schemes and support.</span>
              </div>
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon">✳</span>
              <div>
                <strong>Make informed decisions</strong>
                <span>Find useful resources for your next step.</span>
              </div>
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon">⌁</span>
              <div>
                <strong>Keep moving forward</strong>
                <span>Bring your startup journey into one place.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-showcase-footer">
          A little clarity can change your next move.
        </div>
        <div className="auth-decoration auth-decoration-one" />
        <div className="auth-decoration auth-decoration-two" />
      </section>

      <section className="auth-form-side">
        <div className="auth-mobile-brand">
          <span className="auth-brand-mark">S</span>
          <span>StartupIQ</span>
        </div>

        <div className="auth-form-wrap">
          <div className="auth-topline">
            <span>{mode === "login" ? "WELCOME BACK" : "GET STARTED"}</span>
            {onClose && (
              <button className="auth-close" onClick={onClose} type="button">
                Back to app
              </button>
            )}
          </div>

          <h2>
            {mode === "login" ? "Welcome back." : "Create your account."}
          </h2>
          <p className="auth-subtitle">
            {mode === "login"
              ? "Sign in to continue your startup journey."
              : "Join StartupIQ and take your next step."}
          </p>

          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={mode === "login" ? "active" : ""}
              onClick={() => switchMode("login")}
            >
              Login
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signup"}
              className={mode === "signup" ? "active" : ""}
              onClick={() => switchMode("signup")}
            >
              Create account
            </button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === "signup" && (
              <label className="auth-field">
                <span>Full name</span>
                <input
                  name="name"
                  type="text"
                  placeholder="Enter your full name"
                  value={form.name}
                  onChange={update}
                  autoComplete="name"
                  required
                  minLength={2}
                />
              </label>
            )}

            <label className="auth-field">
              <span>Email address</span>
              <input
                name="email"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={update}
                autoComplete="email"
                required
              />
            </label>

            <label className="auth-field">
              <span>Password</span>
              <div className="auth-password-wrap">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={update}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  className="auth-show-password"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {mode === "signup" && (
                <small>Use at least 8 characters.</small>
              )}
            </label>

            {mode === "signup" && (
              <>
                <label className="auth-field">
                  <span>Confirm password</span>
                  <input
                    name="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="Re-enter your password"
                    value={form.confirmPassword}
                    onChange={update}
                    autoComplete="new-password"
                    required
                    minLength={8}
                  />
                </label>

                <label className="auth-agree">
                  <input
                    type="checkbox"
                    name="agree"
                    checked={form.agree}
                    onChange={update}
                  />
                  <span>
                    I agree to the terms of use and privacy policy.
                  </span>
                </label>
              </>
            )}

            {mode === "login" && (
              <div className="auth-options">
                <span>Secure sign in</span>
                <span className="auth-secure-dot">● Your account</span>
              </div>
            )}

            {error && (
              <div className="auth-message auth-error" role="alert">
                {error}
              </div>
            )}

            {success && (
              <div className="auth-message auth-success" role="status">
                {success}
              </div>
            )}

            <button
              className="auth-submit"
              type="submit"
              disabled={loading}
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                ? "Sign in to StartupIQ"
                : "Create my account"}
              {!loading && <span>→</span>}
            </button>
          </form>

          <p className="auth-switch">
            {mode === "login"
              ? "New to StartupIQ?"
              : "Already have an account?"}
            <button
              type="button"
              onClick={() =>
                switchMode(mode === "login" ? "signup" : "login")
              }
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>

          <div className="auth-legal">
            By continuing, you agree to StartupIQ's terms and privacy policy.
          </div>
        </div>
      </section>
    </main>
  );
}
