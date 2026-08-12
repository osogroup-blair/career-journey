import fs from "fs";
import path from "path";

const KNOWLEDGE_DIR = path.join(process.cwd(), "server", "knowledge");

const FILES = [
  "project_instructions.md",
  "JD_pipeline_SKILL.md",
  "Blair_Cover_Letter_SKILL.md",
  "Blair_Voice_SKILL.md",
  "ats_tactics.md",
  "jd_signal_map.md",
];

function loadKnowledge(): string {
  return FILES.map((name) => {
    const filePath = path.join(KNOWLEDGE_DIR, name);
    const contents = fs.readFileSync(filePath, "utf-8");
    return `<<< ${name} >>>\n${contents}`;
  }).join("\n\n");
}

// Read once at server startup; these files don't change at runtime.
export const FULL_KNOWLEDGE = loadKnowledge();
