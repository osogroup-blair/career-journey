import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, X, Send, Square, Plus, Trash2 } from "lucide-react";
import { assistantRequest as request } from "../../lib/assistantClient";
import { useAssistant } from "../../assistant/AssistantProvider";
import { pageLabel, suggestions } from "../../assistant/pageRegistry";
import { useStore } from "../../store";
import { dataStore } from "../../data";
import "./assistant.css";
const active = (r: any) =>
  !["succeeded", "failed", "cancelled", "unknown", "needs_input"].includes(
    r.state,
  );
function Json({ value }: { value: any }) {
  return <pre className="assistant-json">{JSON.stringify(value, null, 2)}</pre>;
}
function SafeText({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]{1,200}\]\([^\s)]{1,2000}\))/g);
  return (
    <>
      {parts.map((part, index) => {
        const match = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        if (!match) return part;
        const [, label, url] = match;
        const internal = /^#\/[\w/?=&%-]*$/.test(url),
          external = /^https:\/\//.test(url),
          download = /^\/api\/agent\/exports\/[\w-]+$/.test(url);
        if (!internal && !external && !download) return part;
        return (
          <a
            key={index}
            href={url}
            {...(external
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
            className="underline"
          >
            {label}
          </a>
        );
      })}
    </>
  );
}
export default function AssistantHost() {
  const { context, dirty, markClean } = useAssistant();
  const jobs = useStore((s) => s.jobs),
    navigate = useNavigate();
  const [cap, setCap] = useState<any>(null),
    [open, setOpen] = useState(false),
    [threads, setThreads] = useState<any[]>([]),
    [threadId, setThreadId] = useState(""),
    [snapshot, setSnapshot] = useState<any>(null),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [sending, setSending] = useState(false),
    [needsRefresh, setNeedsRefresh] = useState(false);
  const pendingTurn = useRef<{ fingerprint: string; body: any } | null>(null);
  const panel = useRef<HTMLDivElement>(null),
    launcher = useRef<HTMLButtonElement>(null),
    lastChange = useRef(""),
    lastNavigation = useRef("");
  const [older, setOlder] = useState<any[]>([]),
    [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [rename, setRename] = useState("");
  const [allowRoutineChanges, setAllowRoutineChanges] = useState(false);
  const busy = snapshot?.runs?.some(active);
  useEffect(() => {
    let stopped = false;
    request("/capabilities")
      .then((v) => {
        if (!stopped) setCap(v);
      })
      .catch(() => {});
    return () => {
      stopped = true;
    };
  }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    const chrome = document.getElementById("private-app-chrome");
    if (chrome) chrome.inert = open;
    return () => {
      if (chrome) chrome.inert = false;
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const old = document.activeElement as HTMLElement;
    panel.current?.focus();
    return () => old?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    let stopped = false;
    request("/threads")
      .then((v) => {
        if (stopped) return;
        setThreads(v.items);
        if (!threadId && v.items.length) setThreadId(v.items[0].id);
      })
      .catch((e) => setError(e.message));
    return () => {
      stopped = true;
    };
  }, [open]);
  useEffect(() => {
    if (!open || !threadId) {
      setSnapshot(null);
      return;
    }
    setOlder([]);
    setHistoryCursor(null);
    let stopped = false,
      loading = false,
      initialized = false;
    const poll = async () => {
      if (loading) return;
      loading = true;
      try {
        const value = await request(`/threads/${threadId}`);
        if (stopped) return;
        setSnapshot(value);
        if (value.hasMoreMessages && !initialized)
          setHistoryCursor(value.messages[0]?.id ?? null);
        const changes = value.events.filter((e: any) => e.kind === "changed");
        const fingerprint = changes.map((e: any) => e.id).join("|");
        if (fingerprint && fingerprint !== lastChange.current) {
          lastChange.current = fingerprint;
          setNeedsRefresh(true);
        }
        const nav = value.events
          .filter((e: any) => e.kind === "tool" && e.result?.navigate)
          .at(-1);
        if (nav && initialized && lastNavigation.current !== nav.id) {
          lastNavigation.current = nav.id;
          if (!document.documentElement.hasAttribute("data-assistant-dirty"))
            navigate(nav.result.navigate);
        }
        if (!initialized) {
          lastNavigation.current = nav?.id ?? "";
          initialized = true;
        }
      } catch (e: any) {
        if (!stopped) setError(e.message);
      } finally {
        loading = false;
      }
    };
    void poll();
    const timer = setInterval(poll, 1500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [open, threadId]);
  useEffect(() => {
    if (!needsRefresh || dirty) return;
    let stopped = false;
    useStore
      .getState()
      .reconcileAssistantChanges()
      .then(() => {
        if (!stopped) setNeedsRefresh(false);
      })
      .catch((e) => {
        if (!stopped) setError(e.message);
      });
    return () => {
      stopped = true;
    };
  }, [needsRefresh, dirty]);
  async function action(work: () => Promise<void>) {
    setSending(true);
    setError("");
    try {
      await work();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }
  async function create() {
    const t = await request("/threads", { title: "New conversation" });
    setThreads((ts) => [...ts, t]);
    setThreadId(t.id);
    setSnapshot(null);
    return t.id;
  }
  async function send() {
    if (!text.trim() || sending || busy) return;
    await action(async () => {
      await dataStore.flushWrites?.();
      const id = threadId || (await create());
      const input = {
        text,
        context: { ...context, hasUnsavedChanges: dirty },
        allowRoutineChanges,
      };
      const fingerprint = JSON.stringify(input);
      const body =
        pendingTurn.current?.fingerprint === fingerprint
          ? pendingTurn.current.body
          : { ...input, requestId: crypto.randomUUID() };
      pendingTurn.current = { fingerprint, body };
      await request(`/threads/${id}/turns`, body);
      pendingTurn.current = null;
      setAllowRoutineChanges(false);
      setText("");
      setSnapshot(await request(`/threads/${id}`));
    });
  }
  function keys(e: any) {
    if (e.key === "Escape") {
      setOpen(false);
      launcher.current?.focus();
    }
    if (e.key === "Tab") {
      const nodes = panel.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled),textarea,select,a[href],input",
      );
      if (!nodes?.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  if (!cap?.enabled) return null;
  return (
    <div data-assistant>
      {!open && (
        <button
          ref={launcher}
          className="assistant-launcher"
          onClick={() => setOpen(true)}
          aria-label="Open Career Journey assistant"
          aria-keyshortcuts="Alt+Shift+A"
          title="Assistant (Alt+Shift+A)"
        >
          <MessageCircle size={20} />
          <span>Assistant</span>
        </button>
      )}
      {open && (
        <div
          className="assistant-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Career Journey assistant"
          tabIndex={-1}
          ref={panel}
          onKeyDown={keys}
        >
          <header>
            <strong>Career Journey assistant</strong>
            <button onClick={() => setOpen(false)} aria-label="Close assistant">
              <X size={20} />
            </button>
          </header>
          <div className="assistant-context">
            {pageLabel(context, jobs)}
            {dirty && <span> · Page has edits</span>}
          </div>
          <div className="assistant-toolbar">
            <select
              aria-label="Conversation"
              value={threadId}
              onChange={(e) => setThreadId(e.target.value)}
            >
              <option value="">New conversation</option>
              {threads.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <button
              disabled={sending}
              onClick={() =>
                action(async () => {
                  await create();
                })
              }
              aria-label="New conversation"
            >
              <Plus size={18} />
            </button>
            <button
              disabled={!threadId || sending}
              onClick={() =>
                action(async () => {
                  await request(`/threads/${threadId}`, undefined, "DELETE");
                  setThreads((ts) => ts.filter((t) => t.id !== threadId));
                  setThreadId("");
                  setSnapshot(null);
                })
              }
              aria-label="Delete conversation"
            >
              <Trash2 size={18} />
            </button>
          </div>
          {threadId && (
            <form
              className="assistant-rename"
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  await request(
                    `/threads/${threadId}`,
                    { title: rename },
                    "PATCH",
                  );
                  setThreads((ts) =>
                    ts.map((t) =>
                      t.id === threadId ? { ...t, title: rename } : t,
                    ),
                  );
                  setRename("");
                });
              }}
            >
              <input
                aria-label="New conversation title"
                placeholder="Rename conversation"
                value={rename}
                maxLength={100}
                onChange={(e) => setRename(e.target.value)}
              />
              <button disabled={!rename.trim() || sending}>Rename</button>
            </form>
          )}
          <div className="assistant-body">
            {!snapshot?.messages?.length && (
              <>
                <p>
                  Ask about this page or tell me what you want to change. I use
                  your saved data. Enable routine changes for a request, or
                  review each action before it runs.
                </p>
                {suggestions(context).map((s) => (
                  <button
                    className="assistant-suggestion"
                    key={s}
                    onClick={() => setText(s)}
                  >
                    {s}
                  </button>
                ))}
              </>
            )}
            {historyCursor && (
              <button
                disabled={sending}
                onClick={() =>
                  action(async () => {
                    const page = await request(
                      `/threads/${threadId}/messages?before=${historyCursor}`,
                    );
                    setOlder((items) => [...page.items, ...items]);
                    setHistoryCursor(page.nextCursor);
                  })
                }
              >
                Load earlier messages
              </button>
            )}
            {[...older, ...(snapshot?.messages ?? [])].map((m: any) => (
              <article
                className={`assistant-message assistant-${m.role}`}
                key={m.id}
              >
                <small>{m.role === "user" ? "You" : "Assistant"}</small>
                <p>
                  <SafeText text={m.content} />
                </p>
              </article>
            ))}
            {snapshot?.runs
              ?.filter((r: any) => active(r) || r.state === "unknown")
              .map((r: any) => (
                <div className="assistant-status" key={r.id} role="status">
                  <span>{r.state.replaceAll("_", " ")}</span>
                  <button
                    disabled={sending}
                    onClick={() =>
                      action(async () => {
                        await request(`/runs/${r.id}/cancel`, {});
                        setSnapshot(await request(`/threads/${threadId}`));
                      })
                    }
                  >
                    <Square size={12} /> Stop
                  </button>
                </div>
              ))}
            {snapshot?.approvals?.map((a: any) => (
              <article className="assistant-card" key={a.id}>
                <strong>
                  Review action: {a.input.tool.replaceAll("_", " ")}
                </strong>
                <Json value={a.input.args} />
                <p>
                  This action changes saved data. Generation can consume AI
                  quota. Review the exact values above.
                </p>
                <div>
                  <button
                    disabled={
                      sending || dirty || Date.parse(a.expiresAt) < Date.now()
                    }
                    onClick={() =>
                      action(async () => {
                        await dataStore.flushWrites?.();
                        await request(`/approvals/${a.id}/approve`, {
                          payloadHash: a.payloadHash,
                          context: { ...context, hasUnsavedChanges: dirty },
                        });
                        setSnapshot(await request(`/threads/${threadId}`));
                      })
                    }
                  >
                    Run this action
                  </button>
                  <button
                    disabled={sending}
                    onClick={() =>
                      action(async () => {
                        await request(`/approvals/${a.id}/reject`, {});
                        setSnapshot(await request(`/threads/${threadId}`));
                      })
                    }
                  >
                    Reject
                  </button>
                </div>
              </article>
            ))}
            {snapshot?.proposals?.map((p: any) => (
              <article className="assistant-card" key={p.id}>
                <strong>Career Journey proposal · {p.state}</strong>
                <p>{p.input.summary}</p>
                <Json value={p.input.operations} />
                <details>
                  <summary>Compare saved and proposed Career Journey</summary>
                  <h4>Saved</h4>
                  <Json value={p.before} />
                  <h4>Proposed</h4>
                  <Json value={p.after} />
                </details>
                {p.state === "pending" && (
                  <div>
                    <button
                      disabled={sending || dirty}
                      onClick={() =>
                        action(async () => {
                          await request(`/journey-proposals/${p.id}/apply`, {
                            payloadHash: p.payloadHash,
                            hasUnsavedChanges: dirty,
                          });
                          setNeedsRefresh(true);
                          setSnapshot(await request(`/threads/${threadId}`));
                        })
                      }
                    >
                      Apply reviewed changes
                    </button>
                    <button
                      disabled={sending}
                      onClick={() =>
                        action(async () => {
                          await request(
                            `/journey-proposals/${p.id}/discard`,
                            {},
                          );
                          setSnapshot(await request(`/threads/${threadId}`));
                        })
                      }
                    >
                      Discard
                    </button>
                  </div>
                )}
              </article>
            ))}
            {snapshot?.events?.length > 0 && (
              <details>
                <summary>Activity ({snapshot.events.length})</summary>
                {snapshot.events.map((e: any) => (
                  <div className="assistant-event" key={e.id}>
                    <small>{e.tool ?? e.kind}</small>
                    <span>{e.message ?? e.state ?? ""}</span>
                    {e.kind === "tool" && e.tool === "archive_job" && (
                      <button
                        disabled={sending || dirty}
                        onClick={() =>
                          action(async () => {
                            await request(`/steps/${e.stepId}/undo`, {
                              hasUnsavedChanges: dirty,
                            });
                            setNeedsRefresh(true);
                          })
                        }
                      >
                        Undo archive
                      </button>
                    )}
                    {e.kind === "tool" &&
                      e.result?.downloadPath?.startsWith(
                        "/api/agent/exports/",
                      ) && (
                        <a href={e.result.downloadPath} download>
                          Download {e.result.format}
                        </a>
                      )}
                    {e.kind === "tool" && (
                      <details>
                        <summary>Result</summary>
                        <Json value={e.result} />
                      </details>
                    )}
                  </div>
                ))}
              </details>
            )}
          </div>
          {dirty && (
            <div className="assistant-notice">
              Page edits are protected. Save or discard them before running
              changes.
              <button
                onClick={() =>
                  action(async () => {
                    await dataStore.flushWrites?.();
                    markClean();
                  })
                }
              >
                I saved or discarded my edits
              </button>
            </div>
          )}
          {needsRefresh && dirty && (
            <div className="assistant-notice">
              Saved data changed. Finish your edits to refresh safely.
            </div>
          )}
          {needsRefresh && !dirty && (
            <button
              onClick={() =>
                action(async () => {
                  await useStore.getState().reconcileAssistantChanges();
                  setNeedsRefresh(false);
                })
              }
            >
              Refresh changed data
            </button>
          )}
          {cap.reason && <p className="assistant-notice">{cap.reason}</p>}
          {error && (
            <p className="assistant-error" role="alert">
              {error}
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label htmlFor="assistant-message">
              Message about the current page
            </label>
            <textarea
              id="assistant-message"
              value={text}
              maxLength={12000}
              rows={3}
              onChange={(e) => setText(e.target.value)}
              placeholder="What would you like to do?"
            />
            <label className="assistant-permission">
              <input
                type="checkbox"
                checked={allowRoutineChanges}
                onChange={(e) => setAllowRoutineChanges(e.target.checked)}
              />{" "}
              Allow one routine change for this request (including AI
              generation)
            </label>
            <button
              type="submit"
              disabled={
                !text.trim() || sending || busy || cap.chatAvailable === false
              }
            >
              <Send size={16} /> Send
            </button>
          </form>
          <footer>
            Each model step uses AI quota (up to {cap.maxSteps} per turn). Saved
            chat is sent to the platform AI provider. History expires after the
            configured retention period. BYOM background execution is
            unavailable.
          </footer>
        </div>
      )}
    </div>
  );
}
