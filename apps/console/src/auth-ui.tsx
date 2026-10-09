import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Cable, Github, LoaderCircle, MailCheck, RotateCw } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { analyticsEventForRequest, trackAnalytics } from "./analytics.tsx";
import { LanguageSelector, translateError, useI18n, type Message } from "./i18n.tsx";

export type Request = (path: string, init?: RequestInit) => Promise<any>;
export interface User {
  id: string;
  name: string;
  email: string;
}
interface ApiRequestError extends Error {
  status: number;
  code?: string;
  rawMessage: string;
}
interface AuthConfig {
  registrationEnabled: boolean;
  passwordResetEnabled: boolean;
  requireEmailVerification: boolean;
  githubEnabled: boolean;
}
const VERIFICATION_RESEND_SECONDS = 60;

export function maskEmail(email: string) {
  const separator = email.lastIndexOf("@");
  if (separator < 1) return email;
  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  if (!domain) return email;
  if (local.length === 1) return `*@${domain}`;
  if (local.length === 2) return `${local[0]}*@${domain}`;
  return `${local[0]}***${local.at(-1)}@${domain}`;
}

export function isApiErrorCode(error: unknown, code: string) {
  return error instanceof Error && "code" in error && (error as ApiRequestError).code === code;
}

export function authQueryError(
  error: string | null,
  verification: boolean,
  mode: "login" | "register" | "forgot" | "reset"
): Message | undefined {
  if (!error) return undefined;
  if (error === "signup_disabled")
    return "New account registration is disabled. Existing users can still sign in.";
  if (
    verification &&
    ["TOKEN_EXPIRED", "INVALID_TOKEN", "USER_NOT_FOUND", "INVALID_USER"].includes(error)
  )
    return "This verification link is invalid or expired. Sign in to request a new one.";
  return mode === "login"
    ? "GitHub sign-in could not finish. Verify your GitHub email and try again. Existing email accounts can link GitHub from Account."
    : "This link is invalid or expired. Please try again.";
}

export async function apiRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...init.headers }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const rawMessage =
      body.error?.message ?? body.message ?? body.error_description ?? `HTTP ${response.status}`;
    const error = new Error(translateError(rawMessage));
    Object.assign(error, {
      status: response.status,
      code: body.error?.code ?? body.code,
      rawMessage
    });
    throw error;
  }
  const analyticsEvent = analyticsEventForRequest(path, init.method);
  if (analyticsEvent) trackAnalytics(analyticsEvent);
  return body;
}
export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="Agent Device Cloud">
      <Cable size={25} strokeWidth={1.5} aria-hidden="true" />
      <span>Agent Device Cloud</span>
    </Link>
  );
}
export function AuthLayout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="auth-layout">
      <header className="public-header">
        <Brand />
        <LanguageSelector />
      </header>
      <main className={`login ${wide ? "consent" : ""}`}>{children}</main>
      <footer className="auth-footer">Agent Device Cloud</footer>
    </div>
  );
}

export function CliLogin({ request }: { request: Request }) {
  const { t } = useI18n();
  const location = useLocation();
  const userCode = new URLSearchParams(location.search).get("user_code") ?? "";
  const [status, setStatus] = useState<"loading" | "pending" | "approved" | "denied">("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!userCode) {
      setError(t("This CLI login request is invalid or expired."));
      return;
    }
    request(`/api/auth/device?user_code=${encodeURIComponent(userCode)}`)
      .then((result) => setStatus(result.status))
      .catch((error) => setError(error.message));
  }, [request, t, userCode]);
  const decide = async (decision: "approve" | "deny") => {
    setBusy(true);
    setError("");
    try {
      await request(`/api/auth/device/${decision}`, {
        method: "POST",
        body: JSON.stringify({ userCode })
      });
      setStatus(decision === "approve" ? "approved" : "denied");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout>
      <h1>{t("Connect command line")}</h1>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {status === "loading" ? (
        <p className="description" role="status">
          {t("Checking this login request…")}
        </p>
      ) : status === "approved" ? (
        <>
          <p className="notice" role="status">
            {t("CLI connected. You can close this tab.")}
          </p>
          <code>{userCode}</code>
        </>
      ) : status === "denied" ? (
        <p className="description" role="status">
          {t("CLI login denied. You can close this tab.")}
        </p>
      ) : (
        <>
          <p className="description">
            {t("Confirm that this code matches the one shown in your terminal.")}
          </p>
          <div className="token-value">
            <code>{userCode}</code>
          </div>
          <div className="row-actions">
            <button className="primary" disabled={busy} onClick={() => void decide("approve")}>
              {t("Connect CLI")}
            </button>
            <button className="secondary" disabled={busy} onClick={() => void decide("deny")}>
              {t("Deny")}
            </button>
          </div>
        </>
      )}
    </AuthLayout>
  );
}

export function AuthPage({
  onLogin,
  currentUser
}: {
  onLogin: (returnTo?: string) => Promise<void>;
  currentUser: User | null;
}) {
  const { t } = useI18n();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const oauth = params.has("client_id") && params.has("sig");
  const oauthSearch = oauth
    ? `?${location.search
        .slice(1)
        .split("&")
        .filter((part) => !/^(error|error_description|verification)=/.test(part))
        .join("&")}`
    : "";
  const requestedReturnTo = params.get("return_to");
  const returnTo =
    requestedReturnTo?.startsWith("/cli-login?") &&
    !requestedReturnTo.includes("\\") &&
    !requestedReturnTo.includes("\n")
      ? requestedReturnTo
      : undefined;
  const mode =
    location.pathname === "/register"
      ? "register"
      : location.pathname === "/forgot-password"
        ? "forgot"
        : location.pathname === "/reset-password"
          ? "reset"
          : "login";
  const [config, setConfig] = useState<AuthConfig>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Message>();
  const [busy, setBusy] = useState(false);
  const [githubPending, setGithubPending] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resetEmail, setResetEmail] = useState("");
  const [passwordResetComplete, setPasswordResetComplete] = useState(false);
  useEffect(() => {
    apiRequest("/api/v1/auth/config")
      .then(setConfig)
      .catch((error) => setError(error.message));
  }, []);
  useEffect(() => {
    setError("");
    setNotice(undefined);
    setGithubPending(false);
    setVerificationEmail("");
    setVerificationSent(false);
    setResendCooldown(0);
    setResetEmail("");
    setPasswordResetComplete(false);
  }, [location.pathname]);
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(
      () => setResendCooldown((seconds) => Math.max(0, seconds - 1)),
      1_000
    );
    return () => window.clearInterval(timer);
  }, [resendCooldown > 0]);
  const callbackURL = `${window.location.origin}${oauth ? `/login${oauthSearch}` : (returnTo ?? "/app")}`;
  const verificationCallbackURL = `${window.location.origin}${
    oauth
      ? `/login${oauthSearch}&verification=1`
      : `/login?verification=1${returnTo ? `&return_to=${encodeURIComponent(returnTo)}` : ""}`
  }`;
  const continueOAuth = async (created = false) => {
    const result = await apiRequest("/api/auth/oauth2/continue", {
      method: "POST",
      body: JSON.stringify({
        oauth_query: oauthSearch.slice(1),
        postLogin: true,
        ...(created ? { created } : {})
      })
    });
    window.location.assign(result.url);
  };
  const action = async (run: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await run();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const social = async () => {
    setBusy(true);
    setGithubPending(true);
    setError("");
    setNotice(undefined);
    try {
      const result = await apiRequest("/api/auth/sign-in/social", {
        method: "POST",
        body: JSON.stringify({
          provider: "github",
          callbackURL,
          newUserCallbackURL: callbackURL,
          errorCallbackURL: `${window.location.origin}/login${
            oauth ? oauthSearch : returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ""
          }`,
          disableRedirect: true
        })
      });
      window.location.assign(result.url);
    } catch (error) {
      setError((error as Error).message);
      setGithubPending(false);
      setBusy(false);
    }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(data.get("password") ?? "");
    setNotice(undefined);
    await action(async () => {
      if (mode === "forgot") {
        await apiRequest("/api/auth/request-password-reset", {
          method: "POST",
          body: JSON.stringify({ email, redirectTo: `${window.location.origin}/reset-password` })
        });
        setResetEmail(email);
      } else if (mode === "reset") {
        if (!params.get("token"))
          throw new Error(t("This reset link is missing its token. Request a new link."));
        await apiRequest("/api/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ token: params.get("token"), newPassword: password })
        });
        setPasswordResetComplete(true);
      } else {
        try {
          await apiRequest(
            mode === "register" ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email",
            {
              method: "POST",
              body: JSON.stringify({
                email,
                password,
                callbackURL:
                  mode === "register" && config?.requireEmailVerification
                    ? verificationCallbackURL
                    : callbackURL,
                ...(mode === "register" ? { name: String(data.get("name") ?? "").trim() } : {})
              })
            }
          );
        } catch (error) {
          if (
            config?.requireEmailVerification &&
            mode === "login" &&
            isApiErrorCode(error, "EMAIL_NOT_VERIFIED")
          ) {
            setVerificationEmail(email);
            setVerificationSent(false);
            setResendCooldown(0);
            return;
          }
          throw error;
        }
        if (mode === "register" && config?.requireEmailVerification) {
          setVerificationEmail(email);
          setVerificationSent(true);
          setResendCooldown(VERIFICATION_RESEND_SECONDS);
        } else if (oauth) await continueOAuth(mode === "register");
        else await onLogin(returnTo);
      }
    });
  };
  const disabled =
    !config ||
    (mode === "register" && !config.registrationEnabled) ||
    (mode === "forgot" && !config.passwordResetEnabled);
  const title: Record<typeof mode, Message> = {
    login: "Welcome back",
    register: "Create your account",
    forgot: "Reset your password",
    reset: "Choose a new password"
  };
  const buttons: Record<typeof mode, Message> = {
    login: "Sign in",
    register: "Create account",
    forgot: "Send reset link",
    reset: "Save password"
  };
  const queryError = authQueryError(params.get("error"), params.has("verification"), mode);
  const invalidResetLink = mode === "reset" && (!params.get("token") || !!queryError);
  const completed =
    !!verificationEmail || !!resetEmail || passwordResetComplete || invalidResetLink;
  const pageTitle: Message = verificationEmail
    ? "Verify your email"
    : resetEmail
      ? "Check your email"
      : passwordResetComplete
        ? "Password updated"
        : invalidResetLink
          ? "Reset link expired"
          : title[mode];
  const description = verificationEmail
    ? verificationSent
      ? t("We sent a verification link to {email}. Open it to verify your address and sign in.", {
          email: maskEmail(verificationEmail)
        })
      : t("{email} has not been verified. Request a new verification email to continue.", {
          email: maskEmail(verificationEmail)
        })
    : resetEmail
      ? t("If an account exists for {email}, a password reset link is on its way.", {
          email: maskEmail(resetEmail)
        })
      : passwordResetComplete
        ? t("You can now sign in with your new password.")
        : invalidResetLink
          ? t("Request a new password reset link to continue.")
          : t("Your devices, connected to your agents.");
  return (
    <AuthLayout>
      {githubPending ? (
        <div className="auth-redirect-status" role="status" aria-live="assertive" aria-busy="true">
          <LoaderCircle className="button-spinner" size={22} aria-hidden="true" />
          <span>{t("Connecting to GitHub…")}</span>
        </div>
      ) : null}
      <h1>{t(pageTitle)}</h1>
      <p className="description">{description}</p>
      {queryError ? (
        <p className="form-error" role="alert">
          {t(queryError)}
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="notice" role="status">
          {t(notice)}
        </p>
      ) : null}
      {config && disabled ? (
        <p className="description">{t("This option is disabled on this installation.")}</p>
      ) : null}
      {verificationEmail ? (
        <div className="auth-completion">
          <MailCheck
            className="auth-completion-icon"
            size={28}
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <p className="hint">
            {t("Check your spam folder if the message does not arrive within a few minutes.")}
          </p>
          <button
            className="secondary"
            disabled={busy || resendCooldown > 0}
            onClick={() =>
              action(async () => {
                await apiRequest("/api/auth/send-verification-email", {
                  method: "POST",
                  body: JSON.stringify({
                    email: verificationEmail,
                    callbackURL: verificationCallbackURL
                  })
                });
                setVerificationSent(true);
                setResendCooldown(VERIFICATION_RESEND_SECONDS);
                setNotice("A new verification email was sent.");
              })
            }
          >
            {busy ? (
              <LoaderCircle className="button-spinner" size={17} aria-hidden="true" />
            ) : (
              <RotateCw size={17} aria-hidden="true" />
            )}
            {t(
              busy
                ? "Please wait…"
                : resendCooldown > 0
                  ? "Resend in {seconds}s"
                  : "Resend verification email",
              { seconds: resendCooldown }
            )}
          </button>
          <button
            className="text-link"
            type="button"
            onClick={() => {
              setVerificationEmail("");
              setVerificationSent(false);
              setResendCooldown(0);
              setNotice(undefined);
              setError("");
            }}
          >
            {t(mode === "register" ? "Use a different email" : "Back to sign in")}
          </button>
        </div>
      ) : resetEmail ? (
        <div className="auth-completion">
          <MailCheck
            className="auth-completion-icon"
            size={28}
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <p className="hint">
            {t("Check your spam folder if the message does not arrive within a few minutes.")}
          </p>
          <button className="text-link" type="button" onClick={() => setResetEmail("")}>
            {t("Try another email")}
          </button>
          <Link className="secondary" to={`/login${oauthSearch}`}>
            {t("Back to sign in")}
          </Link>
        </div>
      ) : passwordResetComplete ? (
        <div className="auth-completion">
          <Link className="primary" to={`/login${oauthSearch}`}>
            {t("Sign in")}
          </Link>
        </div>
      ) : invalidResetLink ? (
        <div className="auth-completion">
          <Link className="primary" to="/forgot-password">
            {t("Request a new reset link")}
          </Link>
          <Link className="text-link" to={`/login${oauthSearch}`}>
            {t("Back to sign in")}
          </Link>
        </div>
      ) : currentUser && oauth ? (
        <button className="primary" disabled={busy} onClick={() => action(() => continueOAuth())}>
          {t("Continue as {name}", { name: currentUser.name })}
        </button>
      ) : (
        <>
          {(mode === "login" || mode === "register") && config?.githubEnabled ? (
            <>
              <button
                className="secondary social-button"
                disabled={busy || disabled}
                onClick={social}
                aria-busy={githubPending}
              >
                {githubPending ? (
                  <LoaderCircle className="button-spinner" size={18} aria-hidden="true" />
                ) : (
                  <Github size={18} />
                )}
                {t(githubPending ? "Connecting to GitHub…" : "Continue with GitHub")}
              </button>
              <div className="auth-divider">
                <span>{t("or use email")}</span>
              </div>
            </>
          ) : null}
          <form className="connection-form" onSubmit={submit}>
            {mode === "register" ? (
              <label>
                {t("Name")}
                <input name="name" autoComplete="name" maxLength={128} required />
              </label>
            ) : null}
            {mode !== "reset" ? (
              <label>
                {t("Email")}
                <input name="email" type="email" autoComplete="email" required />
              </label>
            ) : null}
            {mode !== "forgot" ? (
              <label>
                {t("Password")}
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                />
                {mode !== "login" ? (
                  <span className="hint">{t("Use at least 12 characters.")}</span>
                ) : null}
              </label>
            ) : null}
            <button className="primary" type="submit" disabled={busy || disabled}>
              {t(busy ? "Please wait…" : buttons[mode])}
            </button>
          </form>
        </>
      )}
      {!completed ? (
        <div className="auth-links">
          {mode !== "login" ? <Link to={`/login${oauthSearch}`}>{t("Sign in")}</Link> : null}
          {mode === "login" && config?.registrationEnabled ? (
            <Link to={`/register${oauthSearch}`}>{t("Create account")}</Link>
          ) : null}
          {mode === "login" && config?.passwordResetEnabled ? (
            <Link to="/forgot-password">{t("Forgot password?")}</Link>
          ) : null}
        </div>
      ) : null}
    </AuthLayout>
  );
}

export function AccountSettings({
  user,
  request,
  onUpdate,
  onLogout
}: {
  user: User;
  request: Request;
  onUpdate: () => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const { t, date } = useI18n();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Message>();
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<AuthConfig>();
  const [accounts, setAccounts] = useState<{ providerId: string }[]>([]);
  const [sessions, setSessions] = useState<
    { token: string; userAgent?: string; updatedAt: string; expiresAt: string }[]
  >([]);
  const [currentToken, setCurrentToken] = useState("");
  const load = async () => {
    const [all, current, providers, settings] = await Promise.all([
      request("/api/auth/list-sessions"),
      request("/api/auth/get-session"),
      request("/api/auth/list-accounts"),
      request("/api/v1/auth/config")
    ]);
    setSessions(all);
    setCurrentToken(current?.session?.token ?? "");
    setAccounts(providers);
    setConfig(settings);
  };
  useEffect(() => {
    void load().catch((error) => setError(error.message));
  }, [request]);
  const action = async (run: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice(undefined);
    try {
      await run();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const update = async (event: FormEvent<HTMLFormElement>, password: boolean) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await action(async () => {
      await request(password ? "/api/auth/change-password" : "/api/auth/update-user", {
        method: "POST",
        body: JSON.stringify(
          password
            ? {
                currentPassword: data.get("currentPassword"),
                newPassword: data.get("newPassword"),
                revokeOtherSessions: true
              }
            : { name: data.get("name") }
        )
      });
      if (password) form.reset();
      await onUpdate();
      await load();
      setNotice(
        password ? "Password changed. Other sessions were signed out." : "Profile updated."
      );
    });
  };
  return (
    <section className="page">
      <div className="page-header">
        <h1>{t("Account")}</h1>
        <button className="secondary" disabled={busy} onClick={() => action(onLogout)}>
          {t("Sign out")}
        </button>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="notice" role="status">
          {t(notice)}
        </p>
      ) : null}
      <div className="settings-grid">
        <form className="card connection-form" onSubmit={(event) => update(event, false)}>
          <h2>{t("Profile")}</h2>
          <label>
            {t("Name")}
            <input name="name" defaultValue={user.name} maxLength={128} required />
          </label>
          <label>
            {t("Email")}
            <input value={user.email} readOnly />
          </label>
          <button className="primary" disabled={busy}>
            {t("Save changes")}
          </button>
        </form>
        {accounts.some((account) => account.providerId === "credential") ? (
          <form className="card connection-form" onSubmit={(event) => update(event, true)}>
            <h2>{t("Password")}</h2>
            <label>
              {t("Current password")}
              <input
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <label>
              {t("New password")}
              <input
                name="newPassword"
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </label>
            <button className="primary" disabled={busy}>
              {t("Change password")}
            </button>
          </form>
        ) : (
          <div className="card">
            <h2>{t("Password")}</h2>
            <p className="description">{t("You sign in with GitHub.")}</p>
            {config?.passwordResetEnabled ? (
              <Link to="/forgot-password">{t("Use password reset to add an email password.")}</Link>
            ) : null}
          </div>
        )}
      </div>
      {config?.githubEnabled ? (
        <div className="card">
          <h2>{t("Sign-in methods")}</h2>
          <p className="description">
            {accounts.some((account) => account.providerId === "github")
              ? t("GitHub connected")
              : null}
          </p>
          {!accounts.some((account) => account.providerId === "github") ? (
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  const result = await request("/api/auth/link-social", {
                    method: "POST",
                    body: JSON.stringify({
                      provider: "github",
                      callbackURL: `${window.location.origin}/app/settings`,
                      errorCallbackURL: `${window.location.origin}/login`,
                      disableRedirect: true
                    })
                  });
                  window.location.assign(result.url);
                })
              }
            >
              <Github size={16} />
              {t("Connect GitHub")}
            </button>
          ) : null}
        </div>
      ) : null}
      <h2>{t("Signed-in sessions")}</h2>
      <div className="resource-list">
        {sessions.map((session) => (
          <div className="resource-row" key={session.token}>
            <div>
              <strong>
                {t(session.token === currentToken ? "This session" : "Other session")}
              </strong>
              <p className="hint">
                {session.userAgent || t("Command line")} ·{" "}
                {t("Active {date}", { date: date(session.updatedAt) })}
              </p>
            </div>
            {session.token !== currentToken ? (
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    await request("/api/auth/revoke-session", {
                      method: "POST",
                      body: JSON.stringify({ token: session.token })
                    });
                    await load();
                  })
                }
              >
                {t("Sign out")}
              </button>
            ) : (
              <span className="state active">{t("Current")}</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
