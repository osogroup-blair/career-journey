import AuthAction from "../pages/AuthAction";
import React, { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  User,
} from "../lib/auth";
import { auth } from "../lib/auth";
import { setDataStore } from "../data";
import { HttpDataStore } from "../data/HttpDataStore";
import { useStore } from "../store";
import { Button, Input, Label } from "./ui";
import { Loader2, Lock, MailCheck } from "lucide-react";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "auth/email-already-in-use":
    "An account with that email already exists — sign in instead.",
  "auth/weak-password": "Password must be at least 12 characters.",
  "auth/invalid-email": "That email address looks invalid.",
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/wrong-password": "Incorrect email or password.",
  "auth/user-not-found": "No account found with that email.",
  "auth/too-many-requests": "Too many attempts — wait a moment and try again.",
};

function authErrorMessage(err: any): string {
  return (
    AUTH_ERROR_MESSAGES[err?.code] ||
    err?.message ||
    "Something went wrong — try again."
  );
}

function FullScreenStatus({ label }: { label: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex items-center gap-2 text-slate-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> {label}
      </div>
    </div>
  );
}

/** Requires a local account; the server enforces owner/admin permissions. */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = still checking
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  useEffect(() => {
    fetch("/api/auth/config")
      .then((r) => r.json())
      .then((c) => setRegistrationEnabled(c.registrationEnabled === true))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => {
      setHydrated(false);
      setUser(u);
    });
  }, []);

  useEffect(() => {
    if (!user || !user.emailVerified) return;
    let cancelled = false;
    const cloudStore = new HttpDataStore();
    setDataStore(cloudStore);
    const refresh = () => {
      // Refresh only on explicit focus; never replace active AI results or a pending save.
      if (
        !cloudStore.hasPendingWrites() &&
        !Object.values(useStore.getState().activeAiTasks).some(
          (t) => t.status === "running",
        )
      ) {
        void useStore
          .getState()
          .hydrate()
          .catch(() => {});
      }
    };
    const saveError = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      setError(
        `${detail.message}. Reload the page before continuing; your last change was not saved.`,
      );
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("career-journey:save-error", saveError);
    useStore
      .getState()
      .hydrate()
      .then(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("career-journey:save-error", saveError);
    };
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) return;
    setIsSubmitting(true);
    setError("");
    setInfo("");
    try {
      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        await sendEmailVerification(cred.user);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(authErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    if (!user) return;
    setIsSubmitting(true);
    setError("");
    setInfo("");
    try {
      await sendEmailVerification(user);
      setInfo("Verification email sent — check your inbox.");
    } catch (err: any) {
      setError(authErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckVerified = async () => {
    if (!user) return;
    setIsSubmitting(true);
    setError("");
    try {
      await user.reload();
      if (!user.emailVerified) {
        setError(
          "Still not verified — click the link in the email, then try again.",
        );
      }
      // Force a re-render with the reloaded user so the emailVerified check above re-runs.
      setUser(auth!.currentUser);
    } catch (err: any) {
      setError(authErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (/^#\/(reset-password|verify-email)\?/.test(window.location.hash))
    return <AuthAction />;

  if (user === undefined) {
    return <FullScreenStatus label="Checking session…" />;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 text-brand-600">
            <Lock className="w-5 h-5" />
            <h1 className="text-lg font-bold text-slate-900">
              {mode === "signup" ? "Create account" : "Sign in"}
            </h1>
          </div>
          <p className="text-xs text-slate-500">
            {mode === "signup"
              ? "Create an account to build your own career journey and get matched to jobs."
              : "This app's data is private. Sign in to your account."}
          </p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={mode === "signup" ? 12 : undefined}
                required
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === "signup" ? "Create Account" : "Sign In"}
            </Button>
          </form>
          {mode === "signup" && (
            <p className="text-[10px] text-slate-400 text-center">
              By creating an account you agree to our{" "}
              <a
                href="#/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-slate-600"
              >
                Terms
              </a>{" "}
              and{" "}
              <a
                href="#/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-slate-600"
              >
                Privacy Policy
              </a>
              .
            </p>
          )}
          {registrationEnabled && (
            <button
              type="button"
              className="text-xs text-brand-600 hover:underline w-full text-center"
              onClick={() => {
                setMode(mode === "signup" ? "signin" : "signup");
                setError("");
                setInfo("");
              }}
            >
              {mode === "signup"
                ? "Already have an account? Sign in"
                : "Don't have an account? Create one"}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!user.emailVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4 text-center">
          <div className="flex items-center justify-center gap-2 text-brand-600">
            <MailCheck className="w-5 h-5" />
            <h1 className="text-lg font-bold text-slate-900">
              Verify your email
            </h1>
          </div>
          <p className="text-xs text-slate-500">
            We sent a verification link to{" "}
            <span className="font-medium">{user.email}</span>. Click it, then
            continue below.
          </p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          {info && <p className="text-xs text-emerald-600">{info}</p>}
          <div className="space-y-2">
            <Button
              onClick={handleCheckVerified}
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              I've verified, continue
            </Button>
            <Button
              onClick={handleResendVerification}
              disabled={isSubmitting}
              variant="outline"
              className="w-full"
            >
              Resend verification email
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!hydrated) {
    return <FullScreenStatus label="Loading your data…" />;
  }

  return (
    <>
      {error && (
        <div role="alert" className="bg-red-50 text-red-800 p-4">
          {error}
        </div>
      )}
      {children}
    </>
  );
}
