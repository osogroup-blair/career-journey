import { beforeEach, afterEach, it, expect } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  copyFile,
  chmod,
  rm,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
let directory: string,
  work: string,
  old: string,
  target: string,
  env: NodeJS.ProcessEnv;
const git = (...args: string[]) =>
  execFileSync("git", args, {
    cwd: work,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "cj-deploy-"));
  work = path.join(directory, "work");
  await mkdir(work);
  const bin = path.join(directory, "bin");
  await mkdir(bin);
  env = {
    ...process.env,
    PATH: bin + path.delimiter + process.env.PATH,
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
  execFileSync(
    "git",
    [
      "init",
      "--bare",
      "--initial-branch=main",
      path.join(directory, "origin.git"),
    ],
    { env, stdio: "ignore" },
  );
  git("init", "--initial-branch=main");
  git("remote", "add", "origin", path.join(directory, "origin.git"));
  await mkdir(path.join(work, "scripts"));
  await copyFile("scripts/deploy.sh", path.join(work, "scripts/deploy.sh"));
  await writeFile(path.join(work, ".gitignore"), ".env\n.deploy/\nbackups/\n");
  await writeFile(path.join(work, "marker"), "old");
  git("add", ".");
  git("commit", "-m", "old");
  old = git("rev-parse", "HEAD");
  git("push", "-u", "origin", "main");
  await writeFile(path.join(work, "marker"), "new");
  git("add", ".");
  git("commit", "-m", "new");
  target = git("rev-parse", "HEAD");
  git("push", "origin", "main");
  git("checkout", "--detach", old);
  await writeFile(path.join(work, ".env"), "APP_URL=https://example.org\n");
  await mkdir(path.join(work, ".deploy"));
  await writeFile(path.join(work, ".deploy/current"), old + "\n");
  const docker = path.join(bin, "docker");
  await writeFile(
    docker,
    `#!/usr/bin/env bash
set -e
if [[ "$*" == *"ps -aq app"* ]]; then echo test-container; fi
if [[ "$*" == *"--entrypoint tar"* ]]; then tar -czf - --files-from /dev/null; fi
if [[ "$*" == *"up -d"* && "\${APP_VERSION:-}" == "\${FAIL_VERSION:-unmatched}" ]]; then exit 1; fi
exit 0
`,
  );
  await chmod(docker, 0o755);
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
it("deploys the remote revision, archives data and records rollback state without hosted automation", async () => {
  const result = spawnSync("bash", ["scripts/deploy.sh", "main"], {
    cwd: work,
    env,
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
  expect(git("rev-parse", "HEAD")).toBe(target);
  expect(
    (await readFile(path.join(work, ".deploy/current"), "utf8")).trim(),
  ).toBe(target);
  expect(
    (await readFile(path.join(work, ".deploy/previous"), "utf8")).trim(),
  ).toBe(old);
  expect((await readdir(path.join(work, "backups"))).length).toBe(1);
});
it("restores the old checkout/image when replacement health fails", async () => {
  const result = spawnSync("bash", ["scripts/deploy.sh", "main"], {
    cwd: work,
    env: { ...env, FAIL_VERSION: target.slice(0, 12) },
    encoding: "utf8",
  });
  expect(result.status).not.toBe(0);
  expect(git("rev-parse", "HEAD")).toBe(old);
  expect(
    (await readFile(path.join(work, ".deploy/current"), "utf8")).trim(),
  ).toBe(old);
  expect(result.stderr).toContain("restoring");
});
it("rejects unsafe refs before any checkout", async () => {
  const result = spawnSync(
    "bash",
    ["scripts/deploy.sh", "--upload-pack=evil"],
    { cwd: work, env, encoding: "utf8" },
  );
  expect(result.status).toBe(2);
  expect(git("rev-parse", "HEAD")).toBe(old);
});
