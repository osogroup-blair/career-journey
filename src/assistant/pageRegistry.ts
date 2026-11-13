export type AssistantPageContext = {
  schemaVersion: 1;
  pathname: string;
  contextVersion: number;
  jobId?: string;
  tabId?: string;
  sectionId?: string;
  selectedEntity?: {
    type:
      | "role"
      | "achievement"
      | "skill"
      | "keyword"
      | "artifact"
      | "interview";
    id: string;
  };
  filters?: {
    query?: string;
    view?: string;
    stage?: string;
    sort?: string;
    verdict?: string;
  };
  hasUnsavedChanges: boolean;
  timezone: string;
};
export function pageContext(
  pathname: string,
  search: string,
  version: number,
): AssistantPageContext {
  const params = new URLSearchParams(search);
  const jobId = /^\/job\/([\w-]+)(?:\/|$)/.exec(pathname)?.[1];
  const sectionId =
    pathname === "/edit" ? (params.get("section") ?? undefined) : undefined;
  const item = params.get("item");
  const type = (
    { roles: "role", achievements: "achievement", skills: "skill" } as const
  )[sectionId ?? ""];
  return {
    schemaVersion: 1,
    pathname,
    contextVersion: version,
    hasUnsavedChanges: false,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...(jobId ? { jobId } : {}),
    ...(sectionId ? { sectionId } : {}),
    ...(item && type ? { selectedEntity: { type, id: item } } : {}),
  };
}
export const pageLabel = (
  c: AssistantPageContext,
  jobs: Record<string, any>,
) => {
  const job = c.jobId ? jobs[c.jobId] : null;
  return [
    job
      ? `${job.companyName} · ${job.roleTitle}`
      : c.pathname === "/"
        ? "Dashboard"
        : c.pathname.slice(1).replaceAll("-", " "),
    c.jobId ? c.pathname.split("/").at(-1) : undefined,
    c.tabId ?? c.sectionId,
  ]
    .filter(Boolean)
    .join(" · ");
};
export function suggestions(context: AssistantPageContext) {
  if (context.jobId)
    return [
      "Explain this job’s current status",
      "What should I do next for this job?",
      "Find relevant evidence from my Career Journey",
    ];
  if (["/edit", "/journey", "/strengthen", "/build"].includes(context.pathname))
    return [
      "Help me strengthen my career evidence",
      "Find achievements I can improve",
      "Draft a Career Journey change for my review",
    ];
  return [
    "What can I do on this page?",
    "Help me organize my job search",
    "Show my current jobs",
  ];
}
