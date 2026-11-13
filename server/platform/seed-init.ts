// Writes only JSON to stdout so the operator can redirect credentials into a private file.
import { generateSeed } from "./seed";
const emailIndex = process.argv.indexOf("--email"),
  nameIndex = process.argv.indexOf("--name");
if (emailIndex < 0 || !process.argv[emailIndex + 1])
  throw new Error(
    "Usage: seed-init --email admin@example.com [--name Administrator]",
  );
const seed = generateSeed(
  process.argv[emailIndex + 1],
  nameIndex < 0 ? "Administrator" : process.argv[nameIndex + 1],
);
process.stdout.write(JSON.stringify(seed, null, 2) + "\n");
