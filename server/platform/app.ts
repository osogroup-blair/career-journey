import path from "node:path";
export interface App {
  dataDir: string;
}
let app: App | undefined;
export function initializeApp(): App {
  return (app ??= { dataDir: path.resolve(process.env.DATA_DIR || "data") });
}
