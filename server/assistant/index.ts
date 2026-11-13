import express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { App } from "../platform/app";
import { getDatabase } from "../platform/database";
import { digest } from "../platform/auth";
import { requireUser, sessionToken } from "../platform";
import { DomainError, id } from "../agent/contracts";
import type { AgentService } from "../agent/service";
import { hash, required } from "../agent/repository";
import { sendError } from "../agent/http";
import { getAIClient } from "../ai/getAIClient";
import { resolveModelForPrompt } from "../ai/resolveModelForPrompt";
import { getActivePrompt } from "../promptStore";
import {
  checkAndConsumeAiQuota,
  getBillingState,
  recordAiUsage,
} from "../billing";
import { isByomPlan } from "../../src/types/billing";
import { authorizeSession } from "./authority";
import {
  assistantCollections,
  contextSchema,
  decisionSchema,
  enabled,
  limit,
  terminal,
  writesEnabled,
} from "./contracts";
import { resolveContext } from "./context";
import { AssistantRunner } from "./runner";
import { applyProposal } from "./journeyProposals";
export function registerAssistant(
  app: express.Express,
  platform: App,
  service: AgentService,
) {
  const repo = service.repo;
  const runner = new AssistantRunner(
    repo,
    service,
    async (uid, stepId, prompt) => {
      const billing = await getBillingState(platform, uid);
      if (isByomPlan(billing.plan))
        throw new DomainError(
          "USER_INPUT_REQUIRED",
          "Durable assistant execution currently requires platform AI. Browser BYOM keys are not stored; use the existing page assistant for BYOM.",
          400,
        );
      const quota = await checkAndConsumeAiQuota(
        platform,
        uid,
        `assistant_${stepId}`,
      );
      if (quota.allowed === false)
        throw new DomainError("QUOTA_EXCEEDED", quota.reason!, 429);
      const resolved = await resolveModelForPrompt(
        platform,
        "platformAssistant",
      );
      const client = getAIClient(resolved.model, resolved.provider);
      const response = await client.generateStructured({
        systemPrompt: getActivePrompt("platformAssistant"),
        prompt,
        schema: decisionSchema,
        signal: AbortSignal.timeout(
          limit("ASSISTANT_TURN_SECONDS", 300, 900) * 1000,
        ),
        maxOutputTokens: 4096,
        noRetries: true,
      });
      await service.authorizeAssistant({
        type: "assistant",
        uid,
        runId: stepId.slice(0, stepId.lastIndexOf("_")),
        scopes: [],
      });
      await recordAiUsage(
        platform,
        uid,
        {
          endpoint: "platformAssistant",
          model: response.model,
          provider: client.provider,
          ...response.usage,
          isByom: false,
        },
        `assistant_${stepId}`,
      );
      return { data: response.data, tokens: response.usage.totalTokens };
    },
  );
  const router = express.Router();
  router.use(requireUser, async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      await authorizeSession(
        platform,
        (req as any).uid,
        digest(sessionToken(req)),
      );
      next();
    } catch (e) {
      sendError(res, e);
    }
  });
  const route = (
    method: "get" | "post" | "delete" | "patch",
    path: string,
    run: (req: express.Request) => Promise<any>,
  ) =>
    router[method](path, async (req, res) => {
      try {
        res.json(await run(req));
      } catch (e) {
        sendError(res, e);
      }
    });
  const uid = (req: express.Request) => (req as any).uid as string;
  const key = (req: express.Request) => id.parse(req.params.id);
  const thread = async (req: express.Request) => {
    const row = await repo.read(uid(req), "assistantThreads", key(req));
    if (!row || row.deletedAt)
      throw new DomainError("NOT_FOUND", "Thread not found", 404);
    return row;
  };
  route("get", "/capabilities", async (req) => {
    const billing = await getBillingState(platform, uid(req));
    return {
      ...(await runner.capabilities()),
      chatAvailable: !isByomPlan(billing.plan),
      ...(isByomPlan(billing.plan)
        ? {
            reason:
              "Durable assistant chat currently uses platform AI. Use the existing page assistants with your BYOM key.",
          }
        : {}),
    };
  });
  route("get", "/threads", async (req) => {
    let cursor: any = null;
    if (req.query.before) {
      cursor = await repo.read(
        uid(req),
        "assistantThreads",
        id.parse(req.query.before),
      );
      if (!cursor) throw new DomainError("NOT_FOUND", "Thread not found", 404);
    }
    const filters: import("../agent/repository").Filters = cursor
      ? [["createdAt", "<=", cursor.createdAt]]
      : [];
    const rows = (
      await repo.query(uid(req), "assistantThreads", filters, 1000, {
        field: "createdAt",
        direction: "desc",
      })
    ).filter(
      (t) =>
        !t.deletedAt &&
        (!cursor ||
          t.createdAt < cursor.createdAt ||
          (t.createdAt === cursor.createdAt && t.id < cursor.id)),
    );
    const items = rows.slice(0, 50);
    return { items, nextCursor: rows.length > 50 ? items.at(-1)!.id : null };
  });
  route("post", "/threads", async (req) => {
    const input = z
      .object({
        title: z.string().trim().min(1).max(100).default("New conversation"),
      })
      .strict()
      .parse(req.body);
    const value = {
      id: randomUUID(),
      title: input.title,
      createdAt: new Date().toISOString(),
    };
    await repo.transaction(uid(req), async (tx) =>
      tx.set("assistantThreads", value.id, value),
    );
    return value;
  });
  route("patch", "/threads/:id", async (req) => {
    const input = z
      .object({ title: z.string().trim().min(1).max(100) })
      .strict()
      .parse(req.body);
    await thread(req);
    await repo.transaction(uid(req), async (tx) => {
      const r = await required(tx, "assistantThreads", key(req));
      tx.set("assistantThreads", r.id, { ...r, title: input.title });
    });
    return { ok: true };
  });
  route("get", "/threads/:id", async (req) => {
    const t = await thread(req),
      user = uid(req);
    const [messages, runs, approvals, proposals, events] = await Promise.all(
      [
        "assistantMessages",
        "assistantRuns",
        "assistantApprovals",
        "assistantJourneyProposals",
        "assistantEvents",
      ].map((c) =>
        repo.query(user, c, [["threadId", "==", t.id]], 101, {
          field: "createdAt",
          direction: "desc",
        }),
      ),
    );
    return {
      thread: t,
      hasMoreMessages: messages.length > 100,
      messages: messages
        .slice(0, 100)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      runs: runs
        .filter((r) => r.threadId === t.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(({ sessionHash, ...r }) => r),
      approvals: approvals.filter(
        (a) => a.threadId === t.id && a.state === "pending",
      ),
      proposals: proposals.filter((p) => p.threadId === t.id),
      events: events
        .filter((e) => e.threadId === t.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    };
  });
  route("get", "/threads/:id/messages", async (req) => {
    const t = await thread(req),
      user = uid(req);
    const size = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(50)
      .parse(req.query.limit);
    const filters: import("../agent/repository").Filters = [
      ["threadId", "==", t.id],
    ];
    let cursor: any = null;
    if (req.query.before) {
      cursor = await repo.read(
        user,
        "assistantMessages",
        id.parse(req.query.before),
      );
      if (!cursor || cursor.threadId !== t.id)
        throw new DomainError("NOT_FOUND", "Message not found", 404);
      filters.push(["createdAt", "<=", cursor.createdAt]);
    }
    const rows = (
      await repo.query(user, "assistantMessages", filters, 1000, {
        field: "createdAt",
        direction: "desc",
      })
    ).filter(
      (m) =>
        !cursor ||
        m.createdAt < cursor.createdAt ||
        (m.createdAt === cursor.createdAt && m.id < cursor.id),
    );
    const items = rows.slice(0, size);
    return {
      items: items.reverse(),
      nextCursor: rows.length > size ? items[0].id : null,
    };
  });
  route("delete", "/threads/:id", async (req) => {
    const t = await thread(req),
      user = uid(req);
    await repo.transaction(user, async (tx) => {
      tx.set("assistantThreads", t.id, {
        ...t,
        deletedAt: new Date().toISOString(),
        title: "Deleted conversation",
      });
    });
    for (const c of assistantCollections.filter(
      (c) => c !== "assistantThreads",
    )) {
      let after: string | undefined;
      while (true) {
        const rows = await repo.list(user, c, after, 200);
        if (!rows.length) break;
        await repo.transaction(user, async (tx) => {
          for (const row of rows)
            if (
              row.threadId === t.id ||
              (c === "assistantSteps" &&
                (await tx.get("assistantRuns", row.runId))?.threadId === t.id)
            )
              tx.remove(c, row.id);
        });
        after = rows.at(-1)!.id;
      }
    }
    return { ok: true };
  });
  route("post", "/threads/:id/turns", async (req) => {
    const t = await thread(req),
      user = uid(req);
    const input = z
      .object({
        text: z.string().trim().min(1).max(12000),
        context: contextSchema,
        requestId: id,
        allowRoutineChanges: z.boolean().default(false),
      })
      .strict()
      .parse(req.body);
    await resolveContext(repo, user, input.context);
    const runId = hash({ thread: t.id, key: input.requestId }),
      fingerprint = hash(input);
    const result = await repo.transaction(user, async (tx) => {
      const existing = await tx.get("assistantRuns", runId);
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw new DomainError("IDEMPOTENCY_CONFLICT", "Turn ID reused", 409);
        return { runId };
      }
      const currentThread = await required(tx, "assistantThreads", t.id);
      if (currentThread.deletedAt)
        throw new DomainError("NOT_FOUND", "Thread not found", 404);
      const runs = await repo.query(user, "assistantRuns", [], 100, {
        field: "createdAt",
        direction: "desc",
      });
      const activeRuns = await Promise.all(
        ["queued", "running", "waiting_for_operation", "awaiting_approval"].map(
          (state) =>
            repo.query(user, "assistantRuns", [["state", "==", state]], 1),
        ),
      );
      if (activeRuns.some((rows) => rows.length))
        throw new DomainError(
          "BUSY",
          "Finish or stop your current assistant turn first",
          409,
        );
      const recent = runs.filter(
        (r) => Date.parse(r.createdAt) > Date.now() - 60000,
      );
      if (recent.length >= 10)
        throw new DomainError(
          "RATE_LIMITED",
          "Too many turns; try again shortly",
          429,
        );
      const createdAt = new Date().toISOString();
      tx.set("assistantRuns", runId, {
        id: runId,
        threadId: t.id,
        state: "queued",
        step: 0,
        tokens: 0,
        sequence: 0,
        context: input.context,
        sessionHash: digest(sessionToken(req)),
        fingerprint,
        allowRoutineChanges: input.allowRoutineChanges,
        createdAt,
        deadline: new Date(
          Date.now() + limit("ASSISTANT_TURN_SECONDS", 300, 900) * 1000,
        ).toISOString(),
      });
      tx.set("assistantMessages", `${runId}_user`, {
        id: `${runId}_user`,
        runId,
        threadId: t.id,
        role: "user",
        content: input.text,
        context: input.context,
        createdAt,
      });
      return { runId };
    });
    return result;
  });
  route("post", "/runs/:id/cancel", async (req) => {
    await repo.transaction(uid(req), async (tx) => {
      const r = await required(tx, "assistantRuns", key(req));
      tx.set("assistantRuns", r.id, {
        ...r,
        cancelRequested: true,
        state: "cancelled",
      });
      if (r.operationId) {
        const op = await tx.get("agentOperations", r.operationId);
        if (op)
          tx.set("agentOperations", r.operationId, {
            ...op,
            cancelRequested: true,
            ...(op.state === "queued" ? { state: "cancelled" } : {}),
          });
      }
    });
    return { ok: true };
  });
  route("post", "/steps/:id/undo", async (req) => {
    if (!writesEnabled())
      throw new DomainError(
        "POLICY_BLOCKED",
        "Assistant writes are disabled",
        403,
      );
    const input = z
      .object({ hasUnsavedChanges: z.boolean() })
      .strict()
      .parse(req.body);
    if (input.hasUnsavedChanges)
      throw new DomainError(
        "UNSAVED_CHANGES",
        "Save or discard your edits first",
        409,
      );
    const step = await repo.read(uid(req), "assistantSteps", key(req));
    if (!step || step.tool !== "archive_job" || step.state !== "succeeded")
      throw new DomainError(
        "POLICY_BLOCKED",
        "This action cannot be undone",
        409,
      );
    const t = await repo.read(uid(req), "assistantThreads", step.threadId);
    if (!t || t.deletedAt)
      throw new DomainError("NOT_FOUND", "Thread not found", 404);
    const result = await service.invoke(
      { type: "user", uid: uid(req), scopes: [] },
      "restore_job",
      {
        jobId: step.result.id,
        expectedRevision: step.result.revision,
        idempotencyKey: `undo_${step.id}`,
      },
    );
    await repo.transaction(uid(req), async (tx) => {
      const previous = await tx.get("assistantSteps", step.id);
      if (previous)
        tx.set("assistantSteps", step.id, {
          ...previous,
          undoneAt: new Date().toISOString(),
        });
    });
    return result;
  });
  route("get", "/runs/:id/events", async (req) => {
    const r = await repo.read(uid(req), "assistantRuns", key(req));
    if (!r) throw new DomainError("NOT_FOUND", "Run not found", 404);
    const after = z.coerce
      .number()
      .int()
      .nonnegative()
      .default(0)
      .parse(req.query.after);
    return {
      state: r.state,
      events: await repo.query(
        uid(req),
        "assistantEvents",
        [
          ["runId", "==", r.id],
          ["sequence", ">", after],
        ],
        100,
        { field: "sequence", direction: "asc" },
      ),
    };
  });
  route("post", "/approvals/:id/approve", async (req) => {
    const a = z
      .object({ payloadHash: z.string().length(64), context: contextSchema })
      .strict()
      .parse(req.body);
    await resolveContext(repo, uid(req), a.context);
    if (a.context.hasUnsavedChanges)
      throw new DomainError(
        "UNSAVED_CHANGES",
        "Save or discard your edits first",
        409,
      );
    await runner.approve(uid(req), key(req), a.payloadHash);
    return { ok: true };
  });
  route("post", "/approvals/:id/reject", async (req) => {
    await repo.transaction(uid(req), async (tx) => {
      const a = await required(tx, "assistantApprovals", key(req));
      tx.set("assistantApprovals", a.id, { ...a, state: "rejected" });
      const r = await tx.get("assistantRuns", a.runId);
      if (r)
        tx.set("assistantRuns", r.id, {
          ...r,
          state: "cancelled",
          cancelRequested: true,
        });
    });
    return { ok: true };
  });
  route("post", "/journey-proposals/:id/apply", async (req) => {
    const a = z
      .object({
        payloadHash: z.string().length(64),
        hasUnsavedChanges: z.boolean(),
      })
      .strict()
      .parse(req.body);
    if (a.hasUnsavedChanges)
      throw new DomainError(
        "UNSAVED_CHANGES",
        "Save or discard your edits first",
        409,
      );
    return applyProposal(repo, uid(req), key(req), a.payloadHash);
  });
  route("post", "/journey-proposals/:id/discard", async (req) => {
    await repo.transaction(uid(req), async (tx) => {
      const p = await required(tx, "assistantJourneyProposals", key(req));
      if (p.state !== "pending")
        throw new DomainError(
          "REVISION_CONFLICT",
          "Proposal already resolved",
          409,
        );
      tx.set("assistantJourneyProposals", p.id, { ...p, state: "discarded" });
    });
    return { ok: true };
  });
  app.use("/api/assistant", router);
  // Single VM worker; transactional claims also protect against overlapping ticks.
  let busy = false;
  const tick = async () => {
    if (busy || !enabled()) return;
    busy = true;
    try {
      const db = getDatabase(platform);
      for (const state of [
        "running",
        "waiting_for_operation",
        "queued",
        "awaiting_approval",
      ]) {
        const rows = await db
          .collectionGroup("assistantRuns")
          .where("state", "==", state)
          .limit(50)
          .get();
        for (const doc of rows.docs) {
          const user = doc.ref.parent.parent?.id;
          if (!user) continue;
          const run = { ...doc.data(), id: doc.id };
          await runner.recover(user, run);
          if (["queued", "waiting_for_operation"].includes(state))
            await runner.execute(user, doc.id);
        }
      }
    } catch (e) {
      console.error(
        "Assistant worker failed",
        e instanceof Error ? e.name : "unknown",
      );
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => {
    void tick();
  }, 1000);
  timer.unref();
  // Retention deletes content through the same thread tombstone boundary used by API deletion.
  let cleaning = false;
  const cleanup = setInterval(() => {
    if (cleaning) return;
    cleaning = true;
    void (async () => {
      const cutoff =
        Date.now() - limit("ASSISTANT_RETENTION_DAYS", 30, 365) * 86400000;
      const db = getDatabase(platform);
      const threads = await db.collectionGroup("assistantThreads").get();
      for (const doc of threads.docs) {
        const t = doc.data(),
          user = doc.ref.parent.parent?.id;
        if (!user || (!t.deletedAt && Date.parse(t.createdAt) > cutoff))
          continue;
        await doc.ref.set({
          ...t,
          deletedAt: new Date().toISOString(),
          title: "Expired conversation",
        });
        for (const c of assistantCollections.filter(
          (c) => c !== "assistantThreads",
        )) {
          const docs = await db
            .collection("users")
            .doc(user)
            .collection(c)
            .get();
          for (const row of docs.docs)
            if (row.data().threadId === doc.id) await row.ref.delete();
        }
      }
    })()
      .catch(() => console.error("Assistant retention cleanup failed"))
      .finally(() => {
        cleaning = false;
      });
  }, 3600000);
  cleanup.unref();
  return {
    runner,
    tick,
    close() {
      clearInterval(timer);
      clearInterval(cleanup);
    },
  };
}
