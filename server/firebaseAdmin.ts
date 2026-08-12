import { initializeApp, cert, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { Request, Response, NextFunction } from "express";

let adminApp: App | null = null;

export const isFirebaseAdminConfigured = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

function getAdminApp(): App | null {
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
 * No-op passthrough when Firebase Admin isn't configured, so local dev without
 * Firebase set up (the default) is unaffected. Once FIREBASE_SERVICE_ACCOUNT_JSON
 * is set, every request through this must carry a valid Firebase ID token —
 * otherwise a stranger with the deployed URL could burn the Gemini API quota.
 */
export function requireFirebaseAuth(req: Request, res: Response, next: NextFunction): void {
  const app = getAdminApp();
  if (!app) {
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
      next();
    })
    .catch((e) => {
      console.error("Firebase token verification failed", e);
      res.status(401).json({ error: "Invalid or expired session" });
    });
}
