import { useEffect, useState } from "react";
import { authHeaders } from "../lib/aiClient";
import { agentCommand } from "../lib/agentClient";
import { Button, Card, CardContent } from "../components/ui";
export default function AgentLibrary() {
  const [artifacts, setArtifacts] = useState<any[]>([]),
    [applications, setApplications] = useState<any[]>([]),
    [clarifications, setClarifications] = useState<any[]>([]),
    [followUps, setFollowUps] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(null),
    [error, setError] = useState("");
  const refresh = async () => {
    try {
      const [a, b, c, d] = await Promise.all(
        [
          "list_artifacts",
          "list_applications",
          "list_clarifications",
          "list_follow_ups",
        ].map((name) => agentCommand(name, { limit: 100 })),
      );
      setArtifacts(a.items);
      setApplications(b.items);
      setClarifications(c.items);
      setFollowUps(d.items);
    } catch (e: any) {
      setError(e.message);
    }
  };
  const download = async (a: any, format: string) => {
    try {
      const file = await agentCommand("export_artifact", {
        artifactId: a.id,
        format,
        template: "classic",
      });
      const response = await fetch(`/api/agent/exports/${file.id}`, {
        headers: await authHeaders(),
      });
      if (!response.ok) throw new Error("Download failed");
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${a.kind}-${file.id}.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (e: any) {
      setError(e.message);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <h1 className="text-2xl font-bold">Application documents and history</h1>
      <p>
        Immutable agent drafts and exact document versions reported as
        submitted. Reports are attributed to their source; an agent report is
        not independent employer confirmation.
      </p>
      <a className="underline" href="#/agent-connections">
        Manage agent connections
      </a>
      <Button onClick={refresh}>Refresh</Button>
      {error && <p role="alert">{error}</p>}
      <h2 className="text-xl font-semibold">Documents</h2>
      {artifacts.map((a) => (
        <Card key={a.id}>
          <CardContent className="pt-4">
            <p>
              {a.kind} · {a.id} · {a.verification}
            </p>
            <a className="underline" href={`#/job/${a.jobId}/tailored`}>
              Open job
            </a>
            <Button
              onClick={async () => {
                try {
                  setSelected(
                    await agentCommand("get_artifact", { artifactId: a.id }),
                  );
                } catch (e: any) {
                  setError(e.message);
                }
              }}
            >
              View exact revision
            </Button>
            {a.kind !== "form_answers" && (
              <>
                <Button onClick={() => download(a, "pdf")}>Download PDF</Button>
                <Button onClick={() => download(a, "docx")}>
                  Download DOCX
                </Button>
              </>
            )}
            {a.parentId && <p>Previous revision: {a.parentId}</p>}
            <p>{a.claimFlagCount ?? 0} claims flagged for review</p>
          </CardContent>
        </Card>
      ))}
      {selected && (
        <div>
          <Button onClick={() => setSelected(null)}>Close revision</Button>
          <pre className="whitespace-pre-wrap break-words text-sm bg-white p-4 border">
            {JSON.stringify(selected, null, 2)}
          </pre>
        </div>
      )}
      <h2 className="text-xl font-semibold">Submitted applications</h2>
      {applications.map((a) => (
        <Card key={a.id}>
          <CardContent className="pt-4 space-y-2">
            <p>
              {new Date(a.submittedAt).toLocaleString()} · {a.verification}
            </p>
            <p className="break-all">{a.destination}</p>
            <p>Receipt: {a.receipt}</p>
            {a.artifactIds.map((key: string) => (
              <Button
                key={key}
                onClick={async () => {
                  try {
                    setSelected(
                      await agentCommand("get_artifact", { artifactId: key }),
                    );
                  } catch (e: any) {
                    setError(e.message);
                  }
                }}
              >
                Submitted document {key}
              </Button>
            ))}
          </CardContent>
        </Card>
      ))}
      <h2 className="text-xl font-semibold">Career evidence requests</h2>
      {clarifications.map((c) => (
        <p key={c.id}>
          {c.question} ·{" "}
          <a className="underline" href="#/edit">
            Resolve in Career Journey editor
          </a>
        </p>
      ))}
      <h2 className="text-xl font-semibold">Follow-ups</h2>
      {followUps.map((f) => (
        <p key={f.id}>
          {new Date(f.dueAt).toLocaleString()} · {f.note} ·{" "}
          {f.completedAt ? "Completed" : "Open"}
        </p>
      ))}
    </div>
  );
}
