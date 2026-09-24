import fs from "fs";
import path from "path";

const KNOWLEDGE_DIR = path.join(process.cwd(), "server", "knowledge");
const OVERRIDE_DIR = path.join(process.cwd(), "server", "knowledgeConfig");

const PIPELINE_FILES = [
  "project_instructions.md",
  "JD_pipeline_SKILL.md",
  "cover_letter_skill.md",
  "voice_skill.md",
  "ats_tactics.md",
  "jd_signal_map.md",
];

const BUILDER_FILE = "career_journey_builder_SKILL.md";

type SkillFamily = "pipeline" | "builder" | "custom";

interface BaseSkillMeta {
  filename: string;
  label: string;
  family: SkillFamily;
}

const BASE_SKILLS: BaseSkillMeta[] = [
  { filename: "project_instructions.md", label: "Project Instructions", family: "pipeline" },
  { filename: "JD_pipeline_SKILL.md", label: "JD Pipeline Skill", family: "pipeline" },
  { filename: "cover_letter_skill.md", label: "Cover Letter Skill", family: "pipeline" },
  { filename: "voice_skill.md", label: "Voice Skill", family: "pipeline" },
  { filename: "ats_tactics.md", label: "ATS Tactics", family: "pipeline" },
  { filename: "jd_signal_map.md", label: "JD Signal Map", family: "pipeline" },
  { filename: "career_journey_builder_SKILL.md", label: "Career Journey Builder Skill", family: "builder" },
];

// Read once at startup — these are the "Restore Default" targets, never
// mutated at runtime. An admin edit is layered on top via OVERRIDE_DIR,
// exactly the same shape as server/promptStore.ts's prompt-template overrides.
const BASE_DEFAULTS: Record<string, string> = Object.fromEntries(
  BASE_SKILLS.map((s) => [s.filename, fs.readFileSync(path.join(KNOWLEDGE_DIR, s.filename), "utf-8")])
);

export interface SkillConfig {
  filename: string;
  label: string;
  family: SkillFamily;
  content: string;
  isCustom: boolean;
  updatedAt: string | null;
  version: number;
}

interface SkillOverride {
  filename: string;
  content: string;
  updatedAt: string;
  version: number;
}

interface CustomSkill {
  filename: string;
  label: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

function overridePath(filename: string): string {
  return path.join(OVERRIDE_DIR, `${filename}.json`);
}

function customListPath(): string {
  return path.join(OVERRIDE_DIR, "_custom.json");
}

function readCustomSkills(): CustomSkill[] {
  try {
    const p = customListPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (e) {
    console.error("Failed to read custom skills, treating as none", e);
  }
  return [];
}

function writeCustomSkills(list: CustomSkill[]): void {
  if (!fs.existsSync(OVERRIDE_DIR)) fs.mkdirSync(OVERRIDE_DIR, { recursive: true });
  fs.writeFileSync(customListPath(), JSON.stringify(list, null, 2));
}

const FILENAME_RE = /^[a-zA-Z0-9_-]+\.md$/;

/**
 * The full set of skills (built-in + admin-created custom), each resolved to
 * its currently-active content: an admin override if saved, else the
 * built-in default. Reads local disk on every call, same tradeoff
 * server/promptStore.ts makes — cheap enough for admin-page and per-request
 * use, and it means an edit is live immediately with no cache to invalidate.
 */
export function getAllSkillConfigs(): Record<string, SkillConfig> {
  const result: Record<string, SkillConfig> = {};

  for (const meta of BASE_SKILLS) {
    let override: SkillOverride | null = null;
    try {
      const p = overridePath(meta.filename);
      if (fs.existsSync(p)) override = JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch (e) {
      console.error(`Failed to read skill override for "${meta.filename}", falling back to default`, e);
    }
    result[meta.filename] = {
      filename: meta.filename,
      label: meta.label,
      family: meta.family,
      content: override?.content ?? BASE_DEFAULTS[meta.filename],
      isCustom: false,
      updatedAt: override?.updatedAt ?? null,
      version: override?.version ?? 0,
    };
  }

  for (const custom of readCustomSkills()) {
    result[custom.filename] = {
      filename: custom.filename,
      label: custom.label,
      family: "custom",
      content: custom.content,
      isCustom: true,
      updatedAt: custom.updatedAt,
      version: custom.version,
    };
  }

  return result;
}

/** Filename -> active content, the shape server/ai/knowledgePreamble.ts concatenates into prompts. */
export function getKnowledgeFiles(): Record<string, string> {
  const configs = getAllSkillConfigs();
  return Object.fromEntries(Object.entries(configs).map(([name, c]) => [name, c.content]));
}

export function getAllKnowledgeFileNames(): string[] {
  return Object.keys(getAllSkillConfigs());
}

export const PIPELINE_KNOWLEDGE_FILE_NAMES = PIPELINE_FILES;
export const BUILDER_KNOWLEDGE_FILE_NAME = BUILDER_FILE;

export function saveSkillOverride(filename: string, content: string): SkillConfig {
  const isBase = BASE_SKILLS.some((s) => s.filename === filename);
  if (isBase) {
    if (!fs.existsSync(OVERRIDE_DIR)) fs.mkdirSync(OVERRIDE_DIR, { recursive: true });
    const p = overridePath(filename);
    let previousVersion = 0;
    if (fs.existsSync(p)) {
      try {
        previousVersion = JSON.parse(fs.readFileSync(p, "utf-8"))?.version ?? 0;
      } catch {
        /* start over */
      }
    }
    const saved: SkillOverride = { filename, content, updatedAt: new Date().toISOString(), version: previousVersion + 1 };
    fs.writeFileSync(p, JSON.stringify(saved, null, 2));
    return getAllSkillConfigs()[filename];
  }

  const list = readCustomSkills();
  const idx = list.findIndex((s) => s.filename === filename);
  if (idx === -1) throw new Error(`Unknown skill "${filename}"`);
  list[idx] = { ...list[idx], content, updatedAt: new Date().toISOString(), version: list[idx].version + 1 };
  writeCustomSkills(list);
  return getAllSkillConfigs()[filename];
}

export function restoreSkillDefault(filename: string): SkillConfig {
  if (!BASE_SKILLS.some((s) => s.filename === filename)) {
    throw new Error(`"${filename}" has no built-in default to restore — it's a custom skill, delete it instead.`);
  }
  const p = overridePath(filename);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  return getAllSkillConfigs()[filename];
}

export function createCustomSkill(filename: string, label: string, content: string): SkillConfig {
  if (!FILENAME_RE.test(filename)) {
    throw new Error("Filename must contain only letters, numbers, underscores, or hyphens, and end in \".md\".");
  }
  const existing = getAllSkillConfigs();
  if (existing[filename]) throw new Error(`A skill named "${filename}" already exists.`);
  if (!label.trim()) throw new Error("label is required.");

  const list = readCustomSkills();
  const now = new Date().toISOString();
  list.push({ filename, label, content, createdAt: now, updatedAt: now, version: 1 });
  writeCustomSkills(list);
  return getAllSkillConfigs()[filename];
}

export function deleteCustomSkill(filename: string): void {
  if (BASE_SKILLS.some((s) => s.filename === filename)) {
    throw new Error(`"${filename}" is a built-in skill and can't be deleted — remove it from a prompt's included-knowledge selection instead.`);
  }
  const list = readCustomSkills();
  if (!list.some((s) => s.filename === filename)) throw new Error(`Unknown custom skill "${filename}"`);
  writeCustomSkills(list.filter((s) => s.filename !== filename));
}
