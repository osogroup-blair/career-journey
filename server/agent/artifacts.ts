import { createHash } from "node:crypto";
import type { Bucket } from "@google-cloud/storage";
import { z } from "zod";
import { buildResumeDocx, buildCoverLetterDocx } from "../docxBuilder";
import { buildResumePdf, buildCoverLetterPdf } from "../pdfBuilder";
import { DomainError, id, requireScope, type Principal } from "./contracts";
import { hash, required } from "./repository";
import type { AgentService } from "./service";
export interface BlobStore {
  putIfAbsent(path: string, bytes: Buffer, mime: string): Promise<Buffer>;
  read(path: string): Promise<Buffer>;
}
export class BucketBlobStore implements BlobStore {
  constructor(private bucket: Bucket) {}
  async putIfAbsent(path: string, bytes: Buffer, mime: string) {
    try {
      await this.bucket
        .file(path)
        .save(bytes, {
          resumable: false,
          contentType: mime,
          preconditionOpts: { ifGenerationMatch: 0 },
        });
      return bytes;
    } catch (e: any) {
      if (e.code === 412) return this.read(path);
      throw e;
    }
  }
  async read(path: string) {
    return (await this.bucket.file(path).download())[0];
  }
}
export class ArtifactExports {
  constructor(
    private service: AgentService,
    private blobs: BlobStore,
  ) {
    service.tools.export_artifact = {
      description:
        "Render an immutable draft as PDF or DOCX and store exact private bytes. PDF uses the classic export renderer. The authenticated download requires the same bearer token.",
      scope: "artifacts:read",
      write: true,
      schema: z
        .object({
          artifactId: id,
          format: z.enum(["pdf", "docx"]),
          template: z
            .enum(["classic", "modern", "executive"])
            .default("classic"),
        })
        .strict(),
      run: (p, a) => this.export(p, a),
    };
    service.tools.get_artifact_download = {
      description:
        "Get an authenticated private download path for an existing export. No public signed URL or token is returned.",
      scope: "artifacts:read",
      schema: z.object({ exportId: id }).strict(),
      run: async (p, a) => {
        const row = await service.repo.read(p.uid, "agentExports", a.exportId);
        if (!row) throw new DomainError("NOT_FOUND", "Export not found", 404);
        return {
          ...row,
          downloadPath: `/mcp/exports/${row.id}`,
          authentication: "Authorization bearer header required",
        };
      },
    };
  }
  async export(
    p: Principal,
    a: { artifactId: string; format: "pdf" | "docx"; template: string },
  ) {
    requireScope(p, "artifacts:read");
    if (a.format === "pdf" && a.template !== "classic")
      throw new DomainError(
        "FEATURE_UNAVAILABLE",
        "Agent PDF renderer currently supports classic only",
      );
    const artifact = await this.service.repo.read(
      p.uid,
      "agentArtifacts",
      a.artifactId,
    );
    if (!artifact)
      throw new DomainError("NOT_FOUND", "Artifact not found", 404);
    if (artifact.kind === "form_answers")
      throw new DomainError(
        "INVALID_INPUT",
        "Form answers are part of the packet, not a PDF/DOCX",
      );
    const exportId = hash({
      artifactId: a.artifactId,
      format: a.format,
      template: a.template,
      renderer: "agent-v1",
    });
    const cached = await this.service.repo.read(
      p.uid,
      "agentExports",
      exportId,
    );
    if (cached) return { ...cached, downloadPath: `/mcp/exports/${exportId}` };
    const content =
      artifact.kind === "resume"
        ? artifact.content
        : {
            ...artifact.content,
            wordCount: artifact.content.content.split(/\s+/).length,
            approvalStatus: "Draft",
          };
    const bytes =
      artifact.kind === "resume"
        ? a.format === "pdf"
          ? await buildResumePdf(content)
          : await buildResumeDocx(content, undefined, {
              template: a.template as any,
            })
        : a.format === "pdf"
          ? await buildCoverLetterPdf(content)
          : await buildCoverLetterDocx(content);
    if (bytes.length > 5 * 1024 * 1024)
      throw new DomainError("LIMIT_EXCEEDED", "Export exceeds 5 MB");
    const mime =
      a.format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const path = `agentArtifacts/${p.uid}/${exportId}.${a.format}`;
    const stored = await this.blobs.putIfAbsent(path, bytes, mime);
    const row = {
      id: exportId,
      artifactId: a.artifactId,
      contentHash: artifact.contentHash,
      format: a.format,
      template: a.template,
      mime,
      size: stored.length,
      byteHash: createHash("sha256").update(stored).digest("hex"),
      createdAt: new Date().toISOString(),
      renderer: "agent-v1",
    };
    await this.service.repo.transaction(p.uid, async (tx) => {
      if (p.type === "agent") {
        const grant = await required(tx, "agentConnections", p.connectionId!);
        if (
          grant.revokedAt ||
          Date.parse(grant.expiresAt) <= Date.now() ||
          !grant.scopes.includes("artifacts:read")
        )
          throw new DomainError("INVALID_TOKEN", "Connection unavailable", 401);
      }
      const existing = await tx.get("agentExports", exportId);
      if (!existing) tx.set("agentExports", exportId, row);
    });
    return { ...row, downloadPath: `/mcp/exports/${exportId}` };
  }
  async download(p: Principal, key: string) {
    requireScope(p, "artifacts:read");
    id.parse(key);
    const row = await this.service.repo.read(p.uid, "agentExports", key);
    if (!row) throw new DomainError("NOT_FOUND", "Export not found", 404);
    const bytes = await this.blobs.read(
      `agentArtifacts/${p.uid}/${key}.${row.format}`,
    );
    if (createHash("sha256").update(bytes).digest("hex") !== row.byteHash)
      throw new DomainError(
        "INTEGRITY_ERROR",
        "Export bytes do not match",
        500,
      );
    return { row, bytes };
  }
}
