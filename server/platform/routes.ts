import express from "express";
import { z } from "zod";
import { getPlatformApp, requireUser, sessionToken } from "../platform";
import { getAuth } from "./auth";
import { getDatabase } from "./database";
import { getStorage } from "./storage";
import { sendEmail, isEmailConfigured } from "../email";
const credentials = z
  .object({
    email: z.string().email().max(254),
    password: z.string().min(1).max(256),
  })
  .strict();
export function registerPlatformRoutes(app: express.Express) {
  const platform = getPlatformApp(),
    auth = getAuth(platform),
    db = getDatabase(platform);
  // Same-origin cookie writes require a custom header; HTML forms cannot set it.
  app.use("/api", (req, res, next) => {
    if (
      ["GET", "HEAD", "OPTIONS"].includes(req.method) ||
      (req.headers.authorization?.startsWith("Bearer ") &&
        req.headers.authorization !== "Bearer selfhosted-session")
    ) {
      next();
      return;
    }
    if (req.headers["x-cj-request"] !== "1") {
      res.status(403).json({ error: "Same-origin request header required" });
      return;
    }
    const origin = req.headers.origin;
    if (
      origin &&
      origin !== new URL(process.env.APP_URL || "http://localhost:47293").origin
    ) {
      res.status(403).json({ error: "Untrusted origin" });
      return;
    }
    next();
  });
  const attempts = new Map<string, { count: number; expires: number }>();
  const rate = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const now = Date.now(),
      key = req.ip || "local";
    for (const [k, v] of attempts) if (v.expires < now) attempts.delete(k);
    const row = attempts.get(key) || { count: 0, expires: now + 60000 };
    if (++row.count > 10 || attempts.size > 10000) {
      res.status(429).json({ error: "Too many attempts; try again shortly" });
      return;
    }
    attempts.set(key, row);
    next();
  };
  const cookie = (res: express.Response, token: string) =>
    res.cookie("cj_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure:
        process.env.NODE_ENV === "production" &&
        process.env.ALLOW_HTTP_LOCAL !== "true",
      path: "/",
      maxAge: 7 * 86400000,
    });
  const route = (
    method: "get" | "post",
    path: string,
    middleware: any[],
    run: (req: express.Request, res: express.Response) => Promise<any>,
  ) =>
    app[method](path, ...middleware, async (req, res) => {
      try {
        const result = await run(req, res);
        if (!res.headersSent) res.json(result);
      } catch (e: any) {
        res.status(e instanceof z.ZodError ? 400 : 400).json({
          error: e instanceof z.ZodError ? "Invalid input" : e.message,
        });
      }
    });
  route("get", "/api/auth/config", [], async () => ({
    registrationEnabled:
      process.env.ALLOW_REGISTRATION === "true" && isEmailConfigured(),
  }));
  route("post", "/api/auth/login", [rate], async (req, res) => {
    const a = credentials.parse(req.body),
      result = await auth.signIn(a.email, a.password);
    cookie(res, result.token);
    return { user: result.user };
  });
  route("post", "/api/auth/register", [rate], async (req, res) => {
    if (process.env.ALLOW_REGISTRATION !== "true" || !isEmailConfigured())
      throw new Error(
        "Self-service registration is disabled; ask the administrator for an account",
      );
    const a = credentials.parse(req.body);
    const user = await auth.createUser({ ...a, emailVerified: false });
    const signed = await auth.signIn(a.email, a.password);
    cookie(res, signed.token);
    return { user };
  });
  route("get", "/api/auth/session", [requireUser], (req) =>
    auth.getUser((req as any).uid),
  );
  route("post", "/api/auth/logout", [], async (req, res) => {
    await auth.signOut(sessionToken(req));
    res.clearCookie("cj_session", { path: "/" });
    return { ok: true };
  });
  route("post", "/api/auth/profile", [requireUser], async (req) =>
    auth.updateUser(
      (req as any).uid,
      z
        .object({ displayName: z.string().trim().max(200) })
        .strict()
        .parse(req.body),
    ),
  );
  route("post", "/api/auth/password", [requireUser], async (req, res) => {
    if (Date.now() - (req as any).authTime > 10 * 60000)
      throw new Error(
        "Sign out and sign in again before changing your password",
      );
    const a = z
      .object({ password: z.string().min(12).max(256) })
      .strict()
      .parse(req.body);
    await auth.updateUser((req as any).uid, a);
    res.clearCookie("cj_session", { path: "/" });
    return { ok: true };
  });
  route(
    "post",
    "/api/auth/send-verification",
    [requireUser, rate],
    async (req) => {
      if (!isEmailConfigured())
        throw new Error("Email delivery is not configured");
      const user = await auth.getUser((req as any).uid);
      const link = await auth.generateEmailVerificationLink(user.email);
      await sendEmail({
        to: user.email,
        subject: "Verify your Career Journey email",
        throwOnError: true,
        html: `<p><a href="${link}">Verify email</a></p>`,
      });
      return { ok: true };
    },
  );
  route("post", "/api/auth/send-reset", [rate], async (req) => {
    const { email } = z
      .object({ email: z.string().email().max(254) })
      .strict()
      .parse(req.body);
    if (isEmailConfigured()) {
      try {
        const link = await auth.generatePasswordResetLink(email);
        await sendEmail({
          to: email,
          subject: "Reset your Career Journey password",
          html: `<p><a href="${link}">Reset password</a></p>`,
        });
      } catch {}
    }
    return { ok: true };
  });
  route("post", "/api/auth/verify-email", [rate], async (req) => {
    const { token } = z
      .object({ token: z.string().regex(/^[\w-]{43}$/) })
      .strict()
      .parse(req.body);
    await auth.consumeAction(token, "verify");
    return { ok: true };
  });
  route("post", "/api/auth/reset-password", [rate], async (req) => {
    const { token, password } = z
      .object({
        token: z.string().regex(/^[\w-]{43}$/),
        password: z.string().min(12).max(256),
      })
      .strict()
      .parse(req.body);
    await auth.consumeAction(token, "reset", password);
    return { ok: true };
  });
  const allowed = new Set([
    "careerJourney",
    "jobs",
    "matches",
    "matchPreferences",
    "promptConfigs",
    "meta",
  ]);
  route("post", "/api/data/read", [requireUser], async (req) => {
    const a = z
      .object({ collection: z.string(), id: z.string().max(120).optional() })
      .strict()
      .parse(req.body);
    if (!allowed.has(a.collection)) throw new Error("Collection unavailable");
    if (a.collection === "meta" && a.id !== "billing")
      throw new Error("Document unavailable");
    const c = db
      .collection("users")
      .doc((req as any).uid)
      .collection(a.collection);
    return a.id
      ? ((await c.doc(a.id).get()).data() ?? null)
      : (await c.get()).docs.map((d) => ({ ...d.data(), id: d.id }));
  });
  route(
    "get",
    "/api/data/models",
    [requireUser],
    async () =>
      (await db.collection("config").doc("allowedModels").get()).data() ?? null,
  );
  route("post", "/api/data/write", [requireUser], async (req) => {
    const a = z
      .object({
        collection: z.enum([
          "careerJourney",
          "matchPreferences",
          "promptConfigs",
        ]),
        id: z.string().regex(/^[\w-]{1,120}$/),
        value: z.record(z.string(), z.unknown()),
      })
      .strict()
      .parse(req.body);
    const ref = db
      .collection("users")
      .doc((req as any).uid)
      .collection(a.collection)
      .doc(a.id);
    await db.runTransaction(async (tx) => {
      const previous = await tx.get(ref);
      if (a.collection === "promptConfigs" && previous.exists)
        tx.set(ref.collection("changeLog").doc(), {
          ...previous.data(),
          changedAt: new Date().toISOString(),
          promptId: a.id,
        });
      tx.set(ref, a.value);
    });
    return { ok: true };
  });
  route("post", "/api/data/prompt-history", [requireUser], async (req) => {
    const { id } = z
      .object({ id: z.string().regex(/^[\w-]{1,120}$/) })
      .strict()
      .parse(req.body);
    return (
      await db
        .collection("users")
        .doc((req as any).uid)
        .collection("promptConfigs")
        .doc(id)
        .collection("changeLog")
        .orderBy("changedAt", "desc")
        .limit(20)
        .get()
    ).docs.map((d) => ({ ...d.data(), id: d.id }));
  });
  app.get("/api/private-files", async (req, res) => {
    try {
      const a = z
        .object({
          path: z.string().max(2000),
          expires: z.coerce.number(),
          signature: z.string(),
        })
        .parse(req.query);
      const bytes = await getStorage(platform)
        .bucket()
        .signedRead(a.path, a.expires, a.signature);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res
        .type(
          a.path.endsWith(".png") ? "image/png" : "application/octet-stream",
        )
        .send(bytes);
    } catch {
      res.status(404).json({ error: "File unavailable" });
    }
  });
}
