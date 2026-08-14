import React, { useEffect, useState } from 'react';
import { listAdminTickets, getAdminTicket, updateAdminTicket, addAdminTicketMessage, getAdminTicketScreenshotUrl } from '../lib/adminClient';
import { Ticket, TicketMessage, TicketStatus, TicketTriageType, TicketPriority } from '../types/support';
import { Badge, Button, Textarea, useToast } from '../components/ui';
import { Bug, Lightbulb, HelpCircle, MoreHorizontal, LifeBuoy, Loader2, ArrowLeft, Camera } from 'lucide-react';

const TYPE_ICON: Record<Ticket['type'], React.ComponentType<{ className?: string }>> = {
  bug: Bug,
  idea: Lightbulb,
  question: HelpCircle,
  other: MoreHorizontal,
};

const STATUS_OPTIONS: TicketStatus[] = ['new', 'triaged', 'backlogged', 'in_progress', 'in_review', 'resolved', 'closed', 'wontfix'];
const STATUS_LABEL: Record<TicketStatus, string> = {
  new: 'New',
  triaged: 'Triaged',
  backlogged: 'Backlogged',
  in_progress: 'In progress',
  in_review: 'In review',
  resolved: 'Resolved',
  closed: 'Closed',
  wontfix: "Won't fix",
};
const STATUS_VARIANT: Record<TicketStatus, 'default' | 'success' | 'warning' | 'destructive' | 'outline'> = {
  new: 'outline',
  triaged: 'default',
  backlogged: 'default',
  in_progress: 'warning',
  in_review: 'warning',
  resolved: 'success',
  closed: 'outline',
  wontfix: 'destructive',
};

const TRIAGE_OPTIONS: TicketTriageType[] = ['bug', 'enhancement', 'question', 'not_actionable'];
const PRIORITY_OPTIONS: TicketPriority[] = ['low', 'medium', 'high', 'critical'];

const selectClass = 'h-9 rounded-md border border-slate-200 bg-white px-2 text-sm';

function TicketDetail({ ticketId, onBack, onChanged }: { ticketId: string; onBack: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [notes, setNotes] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [loadingScreenshot, setLoadingScreenshot] = useState(false);

  const loadScreenshot = async () => {
    setLoadingScreenshot(true);
    try {
      const { url } = await getAdminTicketScreenshotUrl(ticketId);
      setScreenshotUrl(url);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingScreenshot(false);
    }
  };

  const load = () =>
    getAdminTicket(ticketId)
      .then(({ ticket, messages }) => {
        setTicket(ticket);
        setMessages(messages);
        setNotes(ticket.adminNotes || '');
      })
      .catch((e) => toast.error(e.message));

  useEffect(() => { load(); }, [ticketId]);

  const patch = async (updates: Partial<Pick<Ticket, 'status' | 'triageType' | 'priority'>>) => {
    if (!ticket) return;
    setBusy(true);
    try {
      const updated = await updateAdminTicket(ticket.id, updates);
      setTicket(updated);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveNotes = async () => {
    if (!ticket) return;
    setBusy(true);
    try {
      const updated = await updateAdminTicket(ticket.id, { adminNotes: notes });
      setTicket(updated);
      toast.success('Notes saved.');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    try {
      const message = await addAdminTicketMessage(ticketId, reply);
      setMessages((prev) => [...prev, message]);
      setReply('');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!ticket) {
    return <div className="text-center text-sm text-slate-500 py-12">Loading…</div>;
  }

  const TypeIcon = TYPE_ICON[ticket.type];

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to all tickets
      </button>

      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <TypeIcon className="w-4 h-4 text-slate-400 shrink-0" />
            <h1 className="text-base font-bold text-slate-900">{ticket.title}</h1>
          </div>
          <Badge variant={STATUS_VARIANT[ticket.status]}>{STATUS_LABEL[ticket.status]}</Badge>
        </div>
        <p className="text-sm text-slate-600 whitespace-pre-wrap">{ticket.description}</p>
        <p className="text-[10px] text-slate-400">
          {ticket.userEmail || ticket.uid} · {ticket.userPlan} plan · filed {new Date(ticket.createdAt).toLocaleString()}
        </p>
        <p className="text-[10px] text-slate-400">
          {ticket.context.route} · {ticket.context.appVersion} · {ticket.context.viewport} · reported as "{ticket.type}"
        </p>
        <p className="text-[10px] text-slate-300 break-all">{ticket.context.userAgent}</p>

        {ticket.screenshotPath && (
          screenshotUrl ? (
            <img src={screenshotUrl} alt="Reported page screenshot" className="w-full rounded-lg border border-slate-200" />
          ) : (
            <button
              type="button"
              onClick={loadScreenshot}
              disabled={loadingScreenshot}
              className="flex items-center gap-2 text-xs font-medium text-brand-600 hover:underline"
            >
              {loadingScreenshot ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              {loadingScreenshot ? 'Loading screenshot…' : 'View attached screenshot'}
            </button>
          )
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 grid sm:grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1 block">Status</label>
          <select
            value={ticket.status}
            disabled={busy}
            onChange={(e) => patch({ status: e.target.value as TicketStatus })}
            className={`${selectClass} w-full`}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1 block">Triage type</label>
          <select
            value={ticket.triageType || ''}
            disabled={busy}
            onChange={(e) => patch({ triageType: (e.target.value || undefined) as TicketTriageType })}
            className={`${selectClass} w-full`}
          >
            <option value="">Untriaged</option>
            {TRIAGE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1 block">Priority</label>
          <select
            value={ticket.priority || ''}
            disabled={busy}
            onChange={(e) => patch({ priority: (e.target.value || undefined) as TicketPriority })}
            className={`${selectClass} w-full`}
          >
            <option value="">Unset</option>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
        <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 block">Internal notes (never shown to the user)</label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Repro steps, root cause, PR link…" />
        <Button variant="outline" size="sm" onClick={saveNotes} disabled={busy}>Save notes</Button>
      </div>

      <div className="space-y-3">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.authorRole === 'admin' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm ${m.authorRole === 'admin' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className={`text-[10px] mt-1 ${m.authorRole === 'admin' ? 'text-brand-100' : 'text-slate-400'}`}>
                {m.authorRole === 'admin' ? 'Support' : 'User'} · {new Date(m.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
        {messages.length === 0 && <p className="text-center text-xs text-slate-400 py-4">No replies yet.</p>}
      </div>

      <form onSubmit={handleReply} className="flex items-end gap-2">
        <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to the user…" rows={2} className="flex-1" />
        <Button type="submit" disabled={busy || !reply.trim()}>
          {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
          Send
        </Button>
      </form>
    </div>
  );
}

export default function AdminTickets() {
  const toast = useToast();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<TicketStatus | ''>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = () =>
    listAdminTickets(statusFilter ? { status: statusFilter } : undefined)
      .then(setTickets)
      .catch((e) => toast.error(e.message));

  useEffect(() => { load(); }, [statusFilter]);

  if (selectedId) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <TicketDetail ticketId={selectedId} onBack={() => setSelectedId(null)} onChanged={load} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <LifeBuoy className="w-5 h-5 text-brand-500" /> Tickets {tickets ? `(${tickets.length})` : ''}
        </h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TicketStatus | '')}
          className={selectClass}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
      </div>

      {tickets === null && <div className="text-center text-sm text-slate-500 py-12">Loading…</div>}
      {tickets?.length === 0 && (
        <div className="text-center text-sm text-slate-500 py-12 rounded-xl border border-dashed border-slate-200">
          No tickets match this filter.
        </div>
      )}

      <div className="space-y-2">
        {tickets?.map((t) => {
          const TypeIcon = TYPE_ICON[t.type];
          return (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className="w-full flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-brand-300 hover:bg-brand-50/40 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <TypeIcon className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{t.title}</p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {t.userEmail || t.uid} · {new Date(t.createdAt).toLocaleDateString()}
                    {t.priority ? ` · ${t.priority} priority` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {t.triageType && <Badge variant="outline">{t.triageType.replace('_', ' ')}</Badge>}
                <Badge variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</Badge>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
