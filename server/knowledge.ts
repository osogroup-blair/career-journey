import fs from "fs";
import path from "path";

const KNOWLEDGE_DIR = path.join(process.cwd(), "server", "knowledge");

const PIPELINE_FILES = [
  "project_instructions.md",
  "JD_pipeline_SKILL.md",
  "cover_letter_skill.md",
  "voice_skill.md",
  "ats_tactics.md",
  "jd_signal_map.md",
];

const BUILDER_FILE = "career_journey_builder_SKILL.md";

/**
 * Read once at server startup; these files don't change at runtime. Kept as
 * a per-file map (rather than one joined string) so an admin can selectively
 * include/exclude files per prompt — see server/ai/knowledgePreamble.ts.
 */
export const KNOWLEDGE_FILES: Record<string, string> = Object.fromEntries(
  [...PIPELINE_FILES, BUILDER_FILE].map((name) => [name, fs.readFileSync(path.join(KNOWLEDGE_DIR, name), "utf-8")])
);

export const ALL_KNOWLEDGE_FILE_NAMES = Object.keys(KNOWLEDGE_FILES);
export const PIPELINE_KNOWLEDGE_FILE_NAMES = PIPELINE_FILES;
export const BUILDER_KNOWLEDGE_FILE_NAME = BUILDER_FILE;

function joinFiles(names: string[]): string {
  return names.map((name) => `<<< ${name} >>>\n${KNOWLEDGE_FILES[name]}`).join("\n\n");
}

// Preserved for any reader that still wants "everything" without going
// through buildKnowledgePreamble's per-prompt selection.
export const FULL_KNOWLEDGE = joinFiles(PIPELINE_FILES);
export const CAREER_JOURNEY_BUILDER_KNOWLEDGE = KNOWLEDGE_FILES[BUILDER_FILE];
