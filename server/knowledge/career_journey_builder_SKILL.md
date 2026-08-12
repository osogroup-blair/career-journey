# Career Journey Builder — Extraction Rules

Used by the Career Journey Builder (resume upload and guided chat), which turns
unstructured input into a draft Career Journey for a **new or existing user of this
app** — this is generic guidance, not specific to any one person's career.

## Core rule: never fabricate

Only extract what the source material actually states. If a metric, date, title, or
outcome isn't in the resume text or the user's chat answer, leave the field empty or
omit it — do not invent a plausible-sounding number, employer, or achievement. It is
always better to leave a gap than to fabricate evidence; gaps get filled later by the
user or the truth-seeking interview.

## Structure to extract into

Follow the Career Journey schema exactly:

- `person`: name, contact info, location — only if explicitly present in the source.
- `roles[]`: one per employer/position, with `organization`, `title`, `start_date`,
  `end_date`, `location`, `description` (a short summary of scope/responsibility).
- `roles[].initiatives[]`: named projects or bodies of work within a role, if the
  source distinguishes them. If the source is just a flat bullet list with no natural
  grouping, create one initiative per role named after the role itself and put every
  deliverable/achievement under it rather than forcing an artificial breakdown.
- `roles[].initiatives[].deliverables[]`: concrete things built/shipped/delivered,
  each with `description` and, only if the source states a measurable result,
  `impact`.
- `achievements[]` (top-level): quantified outcomes worth surfacing on their own —
  typically the resume bullets that already contain a number or named result. Link
  back to the role via `role_ids`.
- `skills_index[]`: skills/tools/technologies mentioned, deduplicated. Only set
  `years_experience` or `proficiency` if the source gives a basis for it (e.g. an
  explicit "5 years of X" or a skills section that ranks them) — otherwise leave
  blank rather than guessing.
- `education[]`: institution, program, degree_type, start/end if present.

## ID assignment

Number sequentially within this draft starting from 1 for each entity type
(`ROLE-001`, `INIT-001`, `DEL-001`, `ACH-001`, `SK-001`, `EDU-001`), in the order
the source material presents them. Never reuse an ID within the same draft.

## Confidence and gaps

When a field is genuinely ambiguous in the source (e.g. dates given as "2020-2022"
with no month, or a title that's implied but not stated outright), extract your best
reading of it but add a one-line note describing the ambiguity to the `notes` array
in your response — this surfaces to the user for confirmation rather than silently
guessing and moving on.
