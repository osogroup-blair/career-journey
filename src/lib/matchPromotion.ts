import type { JobAnalysis, JobMatch } from "../types";
import { segmentJdText } from "./jdSegments";

export function buildJobFromMatch(
  match: JobMatch,
  jobId: string,
  now: string,
): JobAnalysis {
  const job: JobAnalysis = {
    id: jobId,
    createdAt: now,
    updatedAt: now,
    stage: match.parse ? "Parsed" : "Intake",
    companyName: match.companyName,
    roleTitle: match.roleTitle,
    jdText: match.jdText,
    jobLink: match.applyUrl || match.sourceUrl,
    parse: match.parse,
  };
  if (match.parse && match.jdText) job.jdSegments = segmentJdText(match.jdText);
  if (match.compensationRange) job.compensationRange = match.compensationRange;
  if (match.locationNotes) job.locationNotes = match.locationNotes;
  if (match.source === "stillopen" && match.externalId) {
    job.source = {
      kind: "stillopen",
      listingId: match.externalId,
      listingUrl: match.sourceUrl ?? null,
    };
  }
  return job;
}
