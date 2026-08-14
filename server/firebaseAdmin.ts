import { initializeApp, cert, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { Request, Response, NextFunction } from "express";

let adminApp: App | null = null;

export const isFirebaseAdminConfigured = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

export function getAdminApp(): App | null {
  if (adminApp) return adminApp;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return null;
  try {
    const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    adminApp = initializeApp({ credential: cert(credentials) });
    return adminApp;
  } catch (e) {
    console.error("Failed to initialize Firebase Admin SDK — check FIREBASE_SERVICE_ACCOUNT_JSON", e);
    return null;
  }
}

/**
 * No-op passthrough when Firebase Admin isn't configured AND we're not in a
 * production deploy — local dev without Firebase set up (the default) is
 * unaffected. Once FIREBASE_SERVICE_ACCOUNT_JSON is set, every request through
 * this must carry a valid Firebase ID token — otherwise a stranger with the
 * deployed URL could burn the Gemini API quota.
 *
 * Fails CLOSED, not open, when NODE_ENV=production and the service account
 * isn't configured — a missing/empty env var in the real deployment used to
 * silently open every AI endpoint to anyone with the URL. Local dev keeps the
 * old convenient no-op behavior since NODE_ENV isn't "production" there.
 */
export function requireFirebaseAuth(req: Request, res: Response, next: NextFunction): void {
  const app = getAdminApp();
  if (!app) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "FIREBASE_SERVICE_ACCOUNT_JSON is not set in a production deploy — refusing this request " +
          "rather than falling through unauthenticated. Set the env var to fix."
      );
      res.status(500).json({ error: "Server misconfigured: authentication is unavailable." });
      return;
    }
    next();
    return;
  }

  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing Authorization bearer token" });
    return;
  }

  getAuth(app)
    .verifyIdToken(token)
    .then((decoded) => {
      (req as any).uid = decoded.uid;
      (req as any).isAdmin = decoded.admin === true;
      next();
    })
    .catch((e) => {
      console.error("Firebase token verification failed", e);
      res.status(401).json({ error: "Invalid or expired session" });
    });
}

/**
 * Must run after requireFirebaseAuth (reads the `admin` custom claim it
 * stashed on the decoded ID token — no second Admin SDK round-trip needed).
 * Grant the claim with `npm run set:admin -- <email>`.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!getAdminApp()) {
    // Not configured — requireFirebaseAuth already enforced the prod/dev split
    // above; if we got here, we're in dev without Firebase Admin, so allow
    // through with the same no-op posture as auth itself.
    next();
    return;
  }
  if ((req as any).isAdmin === true) {
    next();
    return;
  }
  res.status(403).json({ error: "Admin access required" });
}
