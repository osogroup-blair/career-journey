import type { AgentService } from "../agent/service";
import { DomainError, type Principal } from "../agent/contracts";
import { required, type Unit } from "../agent/repository";
import { enabled, writesEnabled } from "./contracts";
export const READ_TOOLS = [
  "get_career_journey",
  "search_career_evidence",
  "list_jobs",
  "get_job",
  "list_matches",
  "list_artifacts",
  "get_artifact",
  "list_application_packets",
  "list_applications",
  "list_application_events",
  "list_clarifications",
  "list_follow_ups",
  "get_operation",
];
export const WRITE_TOOLS = [
  "create_job",
  "update_job_details",
  "transition_job",
  "set_resume_build_options",
  "archive_job",
  "restore_job",
  "create_match",
  "dismiss_match",
  "promote_match",
  "create_artifact",
  "select_job_artifact",
  "prepare_application",
  "preflight_application",
  "record_external_application",
  "request_clarification",
  "schedule_follow_up",
  "complete_follow_up",
  "record_interview",
  "record_offer",
  "run_preparation",
  "cancel_operation",
  "export_artifact",
];
export function catalog(service: AgentService) {
  return [...READ_TOOLS, ...(writesEnabled() ? WRITE_TOOLS : [])].filter(
    (n) => service.tools[n],
  );
}
export async function checkAssistantTransaction(p: Principal, tx: Unit) {
  if (p.type !== "assistant") return;
  if (!enabled())
    throw new DomainError("FEATURE_UNAVAILABLE", "Assistant is disabled", 503);
  const run = await required(tx, "assistantRuns", p.runId!);
  const thread = await required(tx, "assistantThreads", run.threadId);
  if (
    thread.deletedAt ||
    run.cancelRequested ||
    !["running", "waiting_for_operation"].includes(run.state) ||
    Date.parse(run.deadline) < Date.now()
  )
    throw new DomainError(
      "CANCELLED",
      "Assistant run is no longer active",
      409,
    );
  if (!writesEnabled())
    throw new DomainError(
      "POLICY_BLOCKED",
      "Assistant writes are disabled",
      403,
    );
}

/** Execution policy is server-owned metadata, never model supplied. */
export function actionPolicy(name: string) {
  const effect =
    name === "navigate"
      ? "navigation"
      : name === "propose_journey_edit"
        ? "proposal"
        : READ_TOOLS.includes(name)
          ? "read"
          : ["record_external_application", "record_offer"].includes(name)
            ? "review"
            : WRITE_TOOLS.includes(name)
              ? "routine"
              : "unavailable";
  return {
    effect,
    reversible: name === "archive_job",
    cost:
      name === "run_preparation"
        ? "ai"
        : name === "export_artifact" || name === "create_artifact"
          ? "storage"
          : "none",
  };
}

/** A focused catalog keeps schema overhead from consuming the conversation budget. */
export function pageTools(pathname: string, requestText: string) {
  const names = new Set([
    "get_career_journey",
    "search_career_evidence",
    "list_jobs",
    "get_job",
    "create_job",
    "update_job_details",
    "archive_job",
    "restore_job",
    "transition_job",
    "run_preparation",
    "get_operation",
    "cancel_operation",
  ]);
  const text = requestText.toLowerCase();
  if (["/matches", "/discover"].includes(pathname) || /match|promot/.test(text))
    for (const n of [
      "list_matches",
      "create_match",
      "dismiss_match",
      "promote_match",
    ])
      names.add(n);
  if (
    pathname.endsWith("/tailored") ||
    pathname === "/agent-library" ||
    /resume|cover letter|document|artifact/.test(text)
  )
    for (const n of [
      "list_artifacts",
      "get_artifact",
      "create_artifact",
      "select_job_artifact",
      "export_artifact",
      "set_resume_build_options",
    ])
      names.add(n);
  if (
    pathname.endsWith("/apply") ||
    /packet|appl(?:ied|ication)|receipt/.test(text)
  )
    for (const n of [
      "prepare_application",
      "preflight_application",
      "list_application_packets",
      "record_external_application",
      "list_applications",
      "list_application_events",
    ])
      names.add(n);
  if (pathname.endsWith("/interview") || /interview|follow.?up/.test(text))
    for (const n of [
      "record_interview",
      "schedule_follow_up",
      "complete_follow_up",
      "list_follow_ups",
    ])
      names.add(n);
  if (
    pathname.endsWith("/offer") ||
    pathname === "/compare-offers" ||
    /offer/.test(text)
  )
    names.add("record_offer");
  if (/clarif/.test(text))
    for (const n of ["request_clarification", "list_clarifications"])
      names.add(n);
  return names;
}
