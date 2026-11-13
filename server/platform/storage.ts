import {
  mkdir,
  readFile,
  writeFile,
  unlink,
  readdir,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { App } from "./app";
export class Bucket {
  readonly root: string;
  private key: Buffer;
  constructor(private app: App) {
    this.root = path.join(app.dataDir, "files");
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    const keyPath = path.join(app.dataDir, "file-signing.key");
    if (!existsSync(keyPath)) {
      try {
        writeFileSync(keyPath, randomBytes(32), { flag: "wx", mode: 0o600 });
      } catch (e: any) {
        if (e.code !== "EEXIST") throw e;
      }
    }
    this.key = readFileSync(keyPath);
  }
  private resolve(name: string) {
    if (
      !name ||
      name.includes("\\") ||
      name.split("/").some((p) => p === ".." || p === "." || !p)
    )
      throw new Error("Invalid private file path");
    const target = path.resolve(this.root, name);
    if (!target.startsWith(this.root + path.sep))
      throw new Error("Invalid file path");
    return target;
  }
  file(name: string) {
    const target = this.resolve(name);
    return {
      save: async (bytes: Buffer, options: any = {}) => {
        await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        try {
          await writeFile(target, bytes, {
            mode: 0o600,
            flag:
              options.preconditionOpts?.ifGenerationMatch === 0 ? "wx" : "w",
          });
        } catch (e: any) {
          if (e.code === "EEXIST")
            throw Object.assign(new Error("File already exists"), {
              code: 412,
            });
          throw e;
        }
      },
      download: async () => [await readFile(target)] as [Buffer],
      delete: async () => {
        await unlink(target).catch((e) => {
          if (e.code !== "ENOENT") throw e;
        });
      },
      getSignedUrl: async (options: any) => {
        const expires = Number(options.expires);
        const signature = this.sign(name, expires);
        return [
          `/api/private-files?path=${encodeURIComponent(name)}&expires=${expires}&signature=${signature}`,
        ];
      },
    };
  }
  private sign(name: string, expires: number) {
    return createHmac("sha256", this.key)
      .update(`${name}\n${expires}`)
      .digest("hex");
  }
  async signedRead(name: string, expires: number, signature: string) {
    if (
      !Number.isSafeInteger(expires) ||
      expires < Date.now() ||
      expires > Date.now() + 10 * 60000 ||
      !/^[a-f0-9]{64}$/.test(signature) ||
      !timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(this.sign(name, expires)),
      )
    )
      throw new Error("Invalid download link");
    return readFile(this.resolve(name));
  }
  async deleteFiles({ prefix }: { prefix: string }) {
    const walk = async (dir: string) => {
      for (const file of await readdir(dir, { withFileTypes: true })) {
        const target = path.join(dir, file.name);
        if (file.isDirectory()) await walk(target);
        else if (file.isFile()) {
          const name = path
            .relative(this.root, target)
            .split(path.sep)
            .join("/");
          if (name.startsWith(prefix)) await unlink(target);
        }
      }
    };
    await walk(this.root);
  }
  async getFiles() {
    const files: any[] = [];
    const walk = async (dir: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(p);
        else if (entry.isFile()) {
          const name = path.relative(this.root, p).split(path.sep).join("/");
          files.push({ name, ...this.file(name) });
        }
      }
    };
    await walk(this.root);
    return [files];
  }
}
export function getStorage(app: App) {
  return { bucket: () => new Bucket(app) };
}
