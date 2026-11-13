import { it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DocumentDatabase } from "../database";
it("validates imports, retains ownership and refuses to overwrite populated data", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cj-import-"));
  try {
    const source = path.join(directory, "export"),
      target = path.join(directory, "data");
    await mkdir(source);
    await writeFile(
      path.join(source, "manifest.json"),
      JSON.stringify({ format: 1, documents: 1, users: 1, files: 0 }),
    );
    await writeFile(
      path.join(source, "records.jsonl"),
      [
        {
          type: "document",
          path: "users/original_uid/careerJourney/current",
          data: { person: { name: "Imported candidate" } },
        },
        {
          type: "user",
          data: {
            uid: "original_uid",
            email: "original@example.org",
            emailVerified: true,
            disabled: false,
            customClaims: { admin: true },
            metadata: {},
          },
        },
      ]
        .map((v) => JSON.stringify(v))
        .join("\n"),
    );
    const invoke = (apply: boolean) =>
      spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "server/platform/import.ts",
          source,
          ...(apply ? ["--apply"] : []),
        ],
        { env: { ...process.env, DATA_DIR: target }, encoding: "utf8" },
      );
    const dry = invoke(false);
    expect(dry.status, dry.stderr).toBe(0);
    expect(dry.stdout).toContain("Dry run valid");
    const applied = invoke(true);
    expect(applied.status, applied.stderr).toBe(0);
    const db = new DocumentDatabase(path.join(target, "career-journey.sqlite"));
    expect(
      (await db.doc("users/original_uid/careerJourney/current").get()).data()
        ?.person.name,
    ).toBe("Imported candidate");
    expect(
      (await db.doc("authUsers/original_uid").get()).data()?.passwordHash,
    ).toBe(null);
    db.close();
    const again = invoke(true);
    expect(again.status).not.toBe(0);
    expect(again.stderr).toContain("empty target");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
