import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { listMyTickets, getMyTicket, addMyTicketMessage } from '../lib/supportClient';
import { Ticket, TicketMessage, TicketStatus } from '../types/support';
import { Badge, Button, Textarea, useToast } from '../components/ui';
import { Bug, Lightbulb, HelpCircle, MoreHorizontal, MessageSquare, Loader2, ArrowLeft, Camera } from 'lucide-react';

const TYPE_ICON: Record<Ticket['type'], React.ComponentType<{ className?: string }>> = {
  bug: Bug,
  idea: Lightbulb,
  question: HelpCircle,
  other: MoreHorizontal,
};

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

function TicketThread({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const toast = useToast();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [reply, setReply] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [loadingScreenshot, setLoadingScreenshot] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);

  const loadScreenshot = async () => {
    setLoadingScreenshot(true);
    try {
      const { getMyTicketScreenshotUrl } = await import('../lib/supportClient');
      const url = await getMyTicketScreenshotUrl(ticketId);
      if (url) setScreenshotUrl(url);
      else toast.error('No screenshot found');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingScreenshot(false);
    }
  };

  const load = () =>
    getMyTicket(ticketId)
      .then(({ ticket, messages }) => {
        setTicket(ticket);
        setMessages(messages);
      })
      .catch((e) => toast.error(e.message));

  useEffect(() => { load(); }, [ticketId]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setIsSending(true);
    try {
      const message = await addMyTicketMessage(ticketId, reply);
      setMessages((prev) => [...prev, message]);
      setReply('');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSending(false);
    }
  };

  if (!ticket) {
    return <div className="text-center text-sm text-slate-500 py-12">Loading…</div>;
  }

  const TypeIcon = TYPE_ICON[ticket.type];

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to all feedback
      </button>

      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <TypeIcon className="w-4 h-4 text-slate-400 shrink-0" />
            <h1 className="text-base font-bold text-slate-900">{ticket.title}</h1>
          </div>
          <Badge variant={STATUS_VARIANT[ticket.status]}>{STATUS_LABEL[ticket.status]}</Badge>
        </div>
        <p className="text-sm text-slate-600 whitespace-pre-wrap">{ticket.description}</p>
        {screenshotUrl ? (
          <div className="mt-4 border border-slate-200 rounded-lg p-2 bg-slate-50">
            <img src={screenshotUrl} alt="Attached screenshot" className="rounded max-h-96 w-auto" />
          </div>
        ) : (
          ticket.screenshotPath && (
            <button
              onClick={loadScreenshot}
              disabled={loadingScreenshot}
              className="mt-4 flex items-center gap-2 text-xs font-medium text-brand-600 hover:underline"
            >
              {loadingScreenshot ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              {loadingScreenshot ? 'Loading screenshot…' : 'View attached screenshot'}
            </button>
          )
        )}
        <p className="text-[10px] text-slate-400">
          Filed {new Date(ticket.createdAt).toLocaleString()} · {ticket.context.route}
        </p>
      </div>

      <div className="space-y-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.authorRole === 'admin' ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm ${
                m.authorRole === 'admin' ? 'bg-slate-100 text-slate-700' : 'bg-brand-600 text-white'
              }`}
            >
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className={`text-[10px] mt-1 ${m.authorRole === 'admin' ? 'text-slate-400' : 'text-brand-100'}`}>
                {m.authorRole === 'admin' ? 'Support' : 'You'} · {new Date(m.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
        {messages.length === 0 && (
          <p className="text-center text-xs text-slate-400 py-4">No replies yet.</p>
        )}
      </div>

      <form onSubmit={handleReply} className="flex items-end gap-2">
        <Textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Add more detail or reply…"
          rows={2}
          className="flex-1"
        />
        <Button type="submit" disabled={isSending || !reply.trim()}>
          {isSending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
          Send
        </Button>
      </form>
    </div>
  );
}

function MyFeedbackInner() {
  const toast = useToast();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    listMyTickets().then(setTickets).catch((e) => toast.error(e.message));
  }, []);

  if (selectedId) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <TicketThread ticketId={selectedId} onBack={() => setSelectedId(null)} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-brand-500" />
        <h1 className="text-2xl font-bold text-slate-900">My Feedback</h1>
      </div>
      <p className="text-sm text-slate-500">Bugs, ideas, and questions you've sent us — use the feedback button anywhere in the app to send a new one.</p>

      {tickets === null && <div className="text-center text-sm text-slate-500 py-12">Loading…</div>}

      {tickets?.length === 0 && (
        <div className="text-center text-sm text-slate-500 py-12 rounded-xl border border-dashed border-slate-200">
          You haven't sent any feedback yet.
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
                  <p className="text-[10px] text-slate-400">{new Date(t.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              <Badge variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function MyFeedback() {
  const billing = useStore((s) => s.billing);
  if (!billing) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-sm text-slate-500">
        Feedback isn't available in local-only mode.
      </div>
    );
  }
  return <MyFeedbackInner />;
}
