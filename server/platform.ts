import type { Request, Response, NextFunction } from "express";
import { initializeApp, type App } from "./platform/app";
import { getAuth } from "./platform/auth";
export function getPlatformApp(): App {
  return initializeApp();
}
export function sessionToken(req: Request) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ") && header !== "Bearer selfhosted-session")
    return header.slice(7);
  return (
    /(?:^|;\s*)cj_session=([\w-]+)/.exec(req.headers.cookie || "")?.[1] || ""
  );
}
export async function requireUser(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const token = sessionToken(req);
    const user = await getAuth(getPlatformApp()).verifyIdToken(token);
    if (!user.email_verified && !req.originalUrl.startsWith("/api/auth/")) {
      res
        .status(403)
        .json({ error: "Verify your email before using the platform" });
      return;
    }
    (req as any).uid = user.uid;
    (req as any).isAdmin = user.admin === true;
    (req as any).authTime = user.auth_time;
    next();
  } catch {
    res.status(401).json({ error: "Sign in required" });
  }
}
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if ((req as any).isAdmin !== true) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
