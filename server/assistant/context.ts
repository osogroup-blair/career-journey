import { DomainError } from "../agent/contracts";
import type { Repository } from "../agent/repository";
import { contextSchema, type PageContext } from "./contracts";
const routes =
  /^\/(?:$|edit$|journey$|build$|strengthen$|applications$|matches$|discover$|spotlight$|profile$|settings$|upgrade$|feedback$|agent-library$|agent-connections$|compare-offers$|migrate$|terms$|privacy$|refunds$|admin(?:\/[\w-]+)?$|job\/[\w-]+(?:\/(?:intake|parsed|rating|tailored|apply|interview|offer))?$)/;
export async function resolveContext(
  repo: Repository,
  uid: string,
  input: unknown,
) {
  const context = contextSchema.parse(input);
  if (!routes.test(context.pathname))
    throw new DomainError("INVALID_INPUT", "Unknown application page");
  const match = /^\/job\/([\w-]+)(?:\/|$)/.exec(context.pathname);
  if (context.jobId && context.jobId !== match?.[1])
    throw new DomainError("INVALID_INPUT", "Page and job do not match");
  const jobId = match?.[1];
  const job = jobId ? await repo.read(uid, "jobs", jobId) : null;
  if (jobId && !job)
    throw new DomainError("NOT_FOUND", "Record not found", 404);
  if (
    context.selectedEntity &&
    ["role", "achievement", "skill"].includes(context.selectedEntity.type)
  ) {
    const journey = await repo.read(uid, "careerJourney", "current");
    const collection = {
      role: "roles",
      achievement: "achievements",
      skill: "skills_index",
    }[context.selectedEntity.type];
    if (
      !(journey?.[collection!] ?? []).some(
        (x: any) => x.id === context.selectedEntity!.id,
      )
    )
      throw new DomainError("NOT_FOUND", "Selected item not found", 404);
  }
  if (
    context.filters &&
    !["/applications", "/matches", "/discover", "/edit"].includes(
      context.pathname,
    )
  )
    throw new DomainError(
      "INVALID_INPUT",
      "Filters are not supported on this page",
    );
  if (context.tabId) {
    const tabs = context.pathname.endsWith("/rating")
      ? ["fit", "keywords", "gaps", "patch"]
      : context.pathname.endsWith("/tailored")
        ? ["resume", "cover-letter", "assistant", "form"]
        : null;
    if (tabs && !tabs.includes(context.tabId))
      throw new DomainError("INVALID_INPUT", "Unknown page tab");
  }
  if (context.selectedEntity?.type === "artifact") {
    const artifact = await repo.read(
      uid,
      "agentArtifacts",
      context.selectedEntity.id,
    );
    if (!artifact || (jobId && artifact.jobId !== jobId))
      throw new DomainError("NOT_FOUND", "Selected artifact not found", 404);
  }
  if (
    context.selectedEntity?.type === "interview" &&
    (!job ||
      !(job.interviews ?? []).some(
        (x: any) => x.id === context.selectedEntity!.id,
      ))
  )
    throw new DomainError("NOT_FOUND", "Interview not found", 404);
  if (
    context.selectedEntity?.type === "keyword" &&
    (!job ||
      !(job.keywords ?? []).some(
        (x: any) => x.id === context.selectedEntity!.id,
      ))
  )
    throw new DomainError("NOT_FOUND", "Keyword not found", 404);
  // Explicit projection: no settings, admin data, cookie, header or arbitrary store dump.
  return {
    ...context,
    ...(jobId ? { jobId } : {}),
    job: job
      ? {
          id: job.id,
          companyName: job.companyName,
          roleTitle: job.roleTitle,
          stage: job.stage,
          revision: job.revision ?? 0,
        }
      : null,
  };
}
export function canMutateContext(context: PageContext) {
  if (context.hasUnsavedChanges)
    throw new DomainError(
      "UNSAVED_CHANGES",
      "Save or discard your page edits before asking the assistant to change data.",
      409,
    );
}
