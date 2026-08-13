import fs from "fs";
import path from "path";

const KNOWLEDGE_DIR = path.join(process.cwd(), "server", "knowledge");

const FILES = [
  "project_instructions.md",
  "JD_pipeline_SKILL.md",
  "cover_letter_skill.md",
  "voice_skill.md",
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

// Separate from FULL_KNOWLEDGE: the Builder's extraction rules are generic (any
// user), unlike the job-application pipeline knowledge in project_instructions.md/
// JD_pipeline_SKILL.md/etc., so they're never bundled into that preamble.
export const CAREER_JOURNEY_BUILDER_KNOWLEDGE = fs.readFileSync(
  path.join(KNOWLEDGE_DIR, "career_journey_builder_SKILL.md"),
  "utf-8"
);
