import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, X, Send, Loader2, Check, Trash2, AlertTriangle, ArrowUpRight, Plus } from 'lucide-react';
import { Button, Label, Textarea, Input } from '../../components/ui';
import { cn } from '../../lib/utils';
import { journeySectionAssist } from '../../lib/aiClient';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import { SECTION_BY_ID, roleLabel, type SectionId } from '../../lib/journeySections';
import {
  SECTION_SPECS,
  applyProposal,
  changelogLine,
  findPossibleDuplicate,
  recordChange,
  type AssistMessage,
  type SectionProposal,
} from '../../lib/journeyAssist';
import { useEditor } from './EditorContext';

/**
 * The per-section AI assistant on /edit. A drawer with a short chat; the model
 * returns draft items ("proposals") that the user edits, then accepts or
 * discards one by one. Nothing is written to the Career Journey until Accept.
 */

type ProposalStatus = 'pending' | 'accepted' | 'rejected';

interface ProposalState {
  proposal: SectionProposal;
  status: ProposalStatus;
  /** User's choice of role for a new project. */
  parentId: string | null;
  /** Set when the user chose to merge into a likely duplicate instead of adding. */
  mergeIntoId: string | null;
  resultId?: string;
  error?: string;
}

interface ChatEntry extends AssistMessage {
  proposals?: ProposalState[];
}

const STARTERS: Record<SectionId, string[]> = {
  profile: ['Tighten my summary for the roles I am targeting', 'Suggest signature outcomes based on my roles'],
  roles: ['I want to add a role that is missing', 'Help me write a stronger description for one of my roles'],
  projects: ['I led a project I have not captured yet', 'Help me add deliverables to one of my projects'],
  achievements: ['Help me turn something I did into a measurable achievement', 'Which achievements are implied by my role descriptions but missing here?'],
  skills: ['Which skills are implied by my roles but missing from this list?', 'I have picked up a new tool recently'],
  capabilities: ['Help me define a capability area I am missing', 'Suggest functions for one of my capabilities'],
  education: ['I want to add a course or program'],
  certifications: ['I want to add a certification'],
  methodologies: ['Which methodologies do my roles suggest I practise?', 'I want to add a framework I use'],
  engagements: ['I want to add a client engagement'],
};

const storageKey = (section: SectionId) => `career-journey:assist:${section}`;
const SESSION_VERSION_KEY = 'career-journey:assist:sessionVersion';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / storage full: the chat just won't survive a reload.
  }
}

function ProposalCard({ section, state, onChange, onAccept, onReject }: {
  key?: string; // no @types/react: JSX doesn't strip `key` (see JobTracker.tsx)
  section: SectionId;
  state: ProposalState;
  onChange: (next: ProposalState) => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  const { cj, lookups, open } = useEditor();
  const spec = SECTION_SPECS[section];
  const { proposal } = state;
  const duplicate = useMemo(() => findPossibleDuplicate(cj, section, proposal), [cj, section, proposal]) as ReturnType<typeof findPossibleDuplicate>;
  const targetLabel = proposal.targetId && proposal.targetId !== 'profile' ? `${proposal.targetId}` : '';
  const done = state.status !== 'pending';
  const needsRole = !!spec.needsParentRole && proposal.op === 'add' && !state.mergeIntoId;

  const setField = (key: string, value: string) =>
    onChange({ ...state, proposal: { ...proposal, fields: { ...proposal.fields, [key]: value } } });
  const setChildField = (idx: number, key: string, value: string) =>
    onChange({
      ...state,
      proposal: {
        ...proposal,
        children: proposal.children.map((c, i) => (i === idx ? { ...c, fields: { ...c.fields, [key]: value } } : c)),
      },
    });

  const isLong = (key: string, value: any) => key === 'description' || key === 'summary' || key === 'impact' || String(value || '').length > 60;
  const chips = [
    ...proposal.roleIds.map((id) => ({ id, label: lookups.name(id), kind: 'role' })),
    ...proposal.skillIds.map((id) => ({ id, label: lookups.name(id), kind: 'skill' })),
    ...proposal.newSkillNames.map((name) => ({ id: name, label: name, kind: 'new skill' })),
  ];

  return (
    <div className={cn('rounded-lg border bg-white p-3 space-y-3', state.status === 'accepted' ? 'border-emerald-300' : state.status === 'rejected' ? 'border-slate-200 opacity-60' : 'border-brand-200')}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-[11px] font-bold uppercase tracking-wide', proposal.op === 'update' || state.mergeIntoId ? 'text-amber-700' : 'text-brand-700')}>
          {state.mergeIntoId ? `Merge into ${state.mergeIntoId}` : proposal.op === 'update' ? `Update ${targetLabel || SECTION_BY_ID[section].singular}` : `New ${SECTION_BY_ID[section].singular.toLowerCase()}`}
        </span>
        {state.status === 'accepted' && state.resultId && (
          <button type="button" onClick={() => open(section, state.resultId === 'profile' ? undefined : state.resultId)} className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1 hover:underline">
            <Check className="w-3.5 h-3.5" /> Saved{state.resultId !== 'profile' ? ` as ${state.resultId}` : ''} <ArrowUpRight className="w-3 h-3" />
          </button>
        )}
        {state.status === 'rejected' && <span className="text-[11px] text-slate-400">Discarded</span>}
      </div>

      {proposal.rationale && <p className="text-xs text-slate-500 italic">{proposal.rationale}</p>}

      {duplicate && !done && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900 space-y-1.5">
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Looks like <strong>{duplicate.id}</strong> “{duplicate.title}”, which you already have.
            </span>
          </div>
          <label className="flex items-center gap-1.5 font-semibold cursor-pointer">
            <input type="checkbox" checked={state.mergeIntoId === duplicate.id} onChange={(e) => onChange({ ...state, mergeIntoId: e.target.checked ? duplicate.id : null })} />
            Merge into {duplicate.id} instead of adding
          </label>
        </div>
      )}

      {needsRole && (
        <div>
          <Label>Role</Label>
          <select
            value={state.parentId || ''}
            disabled={done}
            onChange={(e) => onChange({ ...state, parentId: e.target.value || null })}
            className="w-full h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
          >
            <option value="">Choose a role…</option>
            {(cj.roles || []).map((r: any) => (
              <option key={r.id} value={r.id}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </div>
      )}

      {Object.entries(spec.fields)
        .filter(([key]) => proposal.fields[key] != null && proposal.fields[key] !== '')
        .map(([key]) => (
          <div key={key}>
            <Label>{key.replace(/_/g, ' ')}</Label>
            {isLong(key, proposal.fields[key]) ? (
              <Textarea value={String(proposal.fields[key] ?? '')} disabled={done} rows={3} onChange={(e) => setField(key, e.target.value)} className="text-sm" />
            ) : (
              <Input value={String(proposal.fields[key] ?? '')} disabled={done} onChange={(e) => setField(key, e.target.value)} className="h-9 text-sm" />
            )}
          </div>
        ))}

      {Object.entries(proposal.appendLists || {}).map(([key, values]) => (
        <div key={key}>
          <Label>Add to {key.replace(/_/g, ' ')}</Label>
          <ul className="list-disc pl-5 text-sm text-slate-700 space-y-0.5">
            {values.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        </div>
      ))}

      {spec.children && proposal.children.length > 0 && (
        <div className="space-y-2">
          <Label>{spec.children.label}</Label>
          {proposal.children.map((child, idx) => (
            <div key={idx} className="rounded-md bg-slate-50 border border-slate-100 p-2 space-y-2">
              {Object.keys(spec.children!.fields)
                .filter((key) => child.fields[key])
                .map((key) => (
                  <div key={key}>
                    <span className="text-[10px] font-semibold uppercase text-slate-400">{key.replace(/_/g, ' ')}</span>
                    <Textarea value={String(child.fields[key] ?? '')} disabled={done} rows={2} onChange={(e) => setChildField(idx, key, e.target.value)} className="text-sm" />
                  </div>
                ))}
              {(child.skillIds.length > 0 || child.newSkillNames.length > 0 || child.capabilityIds.length > 0) && (
                <div className="flex flex-wrap gap-1">
                  {[...child.capabilityIds, ...child.skillIds].map((id) => (
                    <span key={id} className="text-[11px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                      {lookups.name(id)}
                    </span>
                  ))}
                  {child.newSkillNames.map((n) => (
                    <span key={n} className="text-[11px] px-1.5 py-0.5 rounded bg-brand-50 text-brand-800 border border-brand-100" title="New skill, added to your index on accept">
                      <Plus className="w-2.5 h-2.5 inline" /> {n}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {chips.map((c) => (
            <span
              key={`${c.kind}-${c.id}`}
              className={cn('text-[11px] px-1.5 py-0.5 rounded', c.kind === 'new skill' ? 'bg-brand-50 text-brand-800 border border-brand-100' : 'bg-slate-100 text-slate-700')}
              title={c.kind === 'new skill' ? 'New skill, added to your index on accept' : `${c.kind} ${c.id}`}
            >
              {c.kind === 'new skill' && <Plus className="w-2.5 h-2.5 inline" />} {c.label}
            </span>
          ))}
        </div>
      )}

      {state.error && <p className="text-xs text-red-600">{state.error}</p>}

      {!done && (
        <div className="flex items-center gap-2 pt-1">
          <Button type="button" size="sm" onClick={onAccept} disabled={needsRole && !state.parentId} className="h-8">
            <Check className="w-3.5 h-3.5 mr-1" /> Accept
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onReject} className="h-8">
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Discard
          </Button>
        </div>
      )}
    </div>
  );
}

export function SectionAssistant({ section, focusItemId, onClearFocus, onClose }: { section: SectionId; focusItemId: string | null; onClearFocus: () => void; onClose: () => void }) {
  const { cj, mutate, items } = useEditor();
  const access = useFeatureAccess('strengthen_journey');
  const [entries, setEntries] = useState<ChatEntry[]>(() => load(storageKey(section), [] as ChatEntry[]));
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const def = SECTION_BY_ID[section];
  const focusTitle = focusItemId ? items[section]?.find((i) => i.id === focusItemId)?.title : null;

  useEffect(() => {
    setEntries(load(storageKey(section), [] as ChatEntry[]));
    setError('');
  }, [section]);

  useEffect(() => save(storageKey(section), entries), [section, entries]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [entries, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [section, focusItemId]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || loading) return;
    const next: ChatEntry[] = [...entries, { role: 'user', content }];
    setEntries(next);
    setDraft('');
    setLoading(true);
    setError('');
    try {
      const transcript = next.map(({ role, content }) => ({ role, content }));
      const res = await journeySectionAssist(section, transcript, cj, focusItemId);
      const reply = [res.reply, res.followUpQuestion].filter(Boolean).join('\n\n');
      setEntries([
        ...next,
        {
          role: 'assistant',
          content: reply || (res.proposals.length ? 'Here is a draft for you to review.' : 'Could you tell me a bit more?'),
          proposals: res.proposals.map((proposal) => ({ proposal, status: 'pending' as ProposalStatus, parentId: proposal.parentId, mergeIntoId: null })),
        },
      ]);
    } catch (e: any) {
      setError(e?.message || 'The assistant could not respond. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const updateProposal = (entryIdx: number, propIdx: number, nextState: ProposalState) =>
    setEntries((prev) =>
      prev.map((entry, i) => (i === entryIdx ? { ...entry, proposals: entry.proposals!.map((p, j) => (j === propIdx ? nextState : p)) } : entry))
    );

  const accept = (entryIdx: number, propIdx: number) => {
    const state = entries[entryIdx]?.proposals?.[propIdx];
    if (!state || state.status !== 'pending') return;
    const resultId = mutate((d, ids) => {
      const id = applyProposal(d, ids, section, state.proposal, { parentId: state.parentId, mergeIntoId: state.mergeIntoId });
      if (id) {
        const version = recordChange(d, changelogLine(section, state.proposal, id, state.mergeIntoId), load<string | null>(SESSION_VERSION_KEY, null));
        save(SESSION_VERSION_KEY, version);
      }
      return id;
    });
    updateProposal(
      entryIdx,
      propIdx,
      resultId ? { ...state, status: 'accepted', resultId, error: undefined } : { ...state, error: 'Could not apply this — the item it refers to may have been deleted.' }
    );
  };

  const pending = entries.flatMap((e, i) => (e.proposals || []).map((p, j) => ({ p, i, j }))).filter(({ p }) => p.status === 'pending');
  const acceptAll = () => {
    for (const { p, i, j } of pending) {
      if (SECTION_SPECS[section].needsParentRole && p.proposal.op === 'add' && !p.mergeIntoId && !p.parentId) continue;
      accept(i, j);
    }
  };

  return (
    <aside
      className="fixed inset-0 sm:inset-y-0 sm:left-auto sm:right-0 z-40 w-full sm:w-[440px] bg-slate-50 border-l border-slate-200 shadow-2xl flex flex-col"
      aria-label={`AI assistant for ${def.label}`}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-brand-600 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900">AI assistant</div>
            <div className="text-[11px] text-slate-500 truncate">{def.label} — drafts stay here until you accept them</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {entries.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setEntries([]);
                setError('');
              }}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-2 py-1"
            >
              New chat
            </button>
          )}
          <button type="button" onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!access.allowed ? (
        <div className="p-6 text-sm text-slate-600">{access.reason || 'The AI assistant is not available on your plan.'}</div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {entries.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Tell me about something to add to your {def.label.toLowerCase()}, or pick a starting point. I will ask a question or two, then draft it for you to review.
                </p>
                <div className="flex flex-col gap-2">
                  {STARTERS[section].map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="text-left text-sm rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:border-brand-300 hover:bg-brand-50">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {entries.map((entry, i) => (
              <div key={i} className={cn('space-y-2', entry.role === 'user' ? 'flex flex-col items-end' : '')}>
                <div
                  className={cn(
                    'max-w-[90%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap',
                    entry.role === 'user' ? 'bg-brand-600 text-white rounded-br-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                  )}
                >
                  {entry.content}
                </div>
                {entry.proposals?.map((p, j) => (
                  <ProposalCard
                    key={`${i}-${j}`}
                    section={section}
                    state={p}
                    onChange={(next) => updateProposal(i, j, next)}
                    onAccept={() => accept(i, j)}
                    onReject={() => updateProposal(i, j, { ...p, status: 'rejected' })}
                  />
                ))}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…
              </div>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>

          <div className="border-t border-slate-200 bg-white p-3 space-y-2">
            {pending.length > 1 && (
              <Button type="button" size="sm" variant="outline" className="w-full" onClick={acceptAll}>
                <Check className="w-3.5 h-3.5 mr-1" /> Accept all {pending.length} drafts
              </Button>
            )}
            {focusItemId && (
              <div className="flex items-center justify-between gap-2 rounded-md bg-brand-50 px-2.5 py-1.5 text-xs text-brand-800">
                <span className="truncate">
                  About <strong>{focusItemId}</strong>
                  {focusTitle ? ` — ${focusTitle}` : ''}
                </span>
                <button type="button" onClick={onClearFocus} className="text-brand-500 hover:text-brand-800" title="Stop focusing on this item">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <Textarea
                ref={inputRef}
                value={draft}
                rows={2}
                placeholder={`Describe what to add or change… (Enter to send)`}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
                className="text-sm resize-none"
                aria-label="Message the AI assistant"
              />
              <Button type="button" onClick={() => send(draft)} disabled={loading || !draft.trim()} className="h-10 w-10 p-0 shrink-0" title="Send">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
