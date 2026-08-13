/** One admin-editable AI prompt. `id` matches the server-side route key (e.g. 'parse', 'fitScore'). */
export interface PromptConfig {
  id: string;
  label: string;
  description: string;
  stage: string;
  /** The editable instructional text only — variable interpolation (job data, career journey JSON) still happens in code around this. */
  template: string;
  updatedAt: string;
  version: number;
}

export interface PromptChangeLogEntry {
  id: string;
  promptId: string;
  version: number;
  changedAt: string;
  previousTemplate: string;
}
