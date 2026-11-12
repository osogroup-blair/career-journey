import { useEffect, useState } from "react";
import { agentRequest, agentCommand } from "../lib/agentClient";
import { Button, Card, CardContent, Input } from "../components/ui";
const LABELS: Record<string, string> = {
  "journey:read": "Read Career Journey",
  "ai:run": "Run platform AI (uses your quota)",
  "jobs:read": "Read jobs and application history",
  "jobs:write": "Manage jobs and follow-ups",
  "matches:read": "Read job matches",
  "matches:write": "Manage job matches",
  "artifacts:read": "Read and download documents",
  "artifacts:write": "Create document revisions",
  "applications:prepare": "Prepare application packets",
  "applications:record": "Record completed external applications",
  "interviews:write": "Manage interview records",
  "offers:write": "Manage offer records",
};
const SCOPES = [
  "journey:read",
  "ai:run",
  "jobs:read",
  "jobs:write",
  "matches:read",
  "matches:write",
  "artifacts:read",
  "artifacts:write",
  "applications:prepare",
  "applications:record",
  "interviews:write",
  "offers:write",
];
export default function AgentConnections() {
  const [connections, setConnections] = useState<any[]>([]),
    [name, setName] = useState(""),
    [scopes, setScopes] = useState(["journey:read", "jobs:read"]),
    [days, setDays] = useState(30),
    [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [events, setEvents] = useState<any[]>([]);
  const refresh = async () => {
    setConnections(await agentRequest("/connections"));
    setEvents(
      (await agentCommand("list_application_events", { limit: 25 })).items,
    );
  };
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Agent connections</h1>
      <p>
        Agents can read your Career Journey. Only you can edit it in the
        platform. Create a separate, expiring connection for each agent.
      </p>
      <p className="text-sm text-slate-600">
        Private beta uses a manual bearer token with clients that support custom
        headers. OAuth connections and platform-managed employer submissions are
        not available. Creating a connection does not authorize an agent to
        submit applications.
      </p>
      <a className="underline" href="#/agent-library">
        Application document library and history
      </a>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <label className="block">
            Connection name
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
          </label>
          <label className="block">
            Expires in days (1–90)
            <Input
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </label>
          <fieldset>
            <legend>Allowed actions</legend>
            <div className="grid sm:grid-cols-2 gap-2">
              {SCOPES.map((scope) => (
                <label key={scope} className="text-sm">
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    onChange={(e) =>
                      setScopes(
                        e.target.checked
                          ? [...scopes, scope]
                          : scopes.filter((s) => s !== scope),
                      )
                    }
                  />{" "}
                  {LABELS[scope]}
                </label>
              ))}
            </div>
          </fieldset>
          <Button
            disabled={busy || !name.trim() || !scopes.length}
            onClick={() =>
              act(async () => {
                const r = await agentRequest("/connections", {
                  name,
                  scopes,
                  expiresInDays: days,
                });
                setToken(r.token);
                setName("");
                await refresh();
              })
            }
          >
            Create connection
          </Button>
          {token && (
            <div className="space-y-2">
              <p>
                Copy this token now. It is shown only once. Keep it private.
              </p>
              <textarea
                readOnly
                value={token}
                aria-label="New agent token"
                className="w-full border p-2"
              />
              <Button onClick={() => setToken("")}>Hide token</Button>
            </div>
          )}
        </CardContent>
      </Card>
      <h2 className="text-xl font-semibold">Connections</h2>
      {connections.map((c) => (
        <Card key={c.id}>
          <CardContent className="pt-4 space-y-2">
            <strong>{c.name}</strong>
            <p className="text-sm">
              {c.scopes.map((s: string) => LABELS[s] ?? s).join(", ")}
            </p>
            <p>
              Expires {new Date(c.expiresAt).toLocaleString()} ·{" "}
              {c.revokedAt ? "Revoked" : "Active"}
            </p>
            {!c.revokedAt && (
              <Button
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    await agentRequest(`/connections/${c.id}/revoke`, {});
                    await refresh();
                  })
                }
              >
                Revoke connection
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
      <h2 className="text-xl font-semibold">Recent activity</h2>
      <Button disabled={busy} onClick={() => act(refresh)}>
        Refresh
      </Button>
      {events.map((e) => (
        <p key={e.id} className="text-sm">
          {new Date(e.createdAt).toLocaleString()} · {e.actor?.type} ·{" "}
          {e.action}
        </p>
      ))}
    </div>
  );
}
