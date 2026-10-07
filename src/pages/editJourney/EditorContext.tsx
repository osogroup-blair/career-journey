import React, { createContext, useContext, useMemo } from 'react';
import { useStore } from '../../store';
import * as mutations from '../../lib/journeyMutations';
import { buildLookups, buildSectionItems, roleLabel, type JourneyLookups, type SectionId, type SectionItem } from '../../lib/journeySections';
import type { PickerOption } from '../../components/journey/fields';

const FALLBACK_VOCAB = {
  proficiency_levels: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
  maturity_levels: ['Foundational', 'Established', 'Advanced', 'Expert', 'Transformational'],
  competency_levels: ['Basic', 'Operational', 'Proficient', 'Specialized', 'Expert'],
  value_stream_stages: ['Strategy', 'Architecture', 'Execution'],
};

export interface EditorContextValue {
  cj: any;
  lookups: JourneyLookups;
  items: Record<SectionId, SectionItem[]>;
  mutate: <T>(recipe: (draft: any, ids: mutations.IdAlloc) => T) => T | undefined;
  /** Navigate to a section, optionally opening one item or pre-filling the search. */
  open: (section: SectionId, itemId?: string, query?: string) => void;
  options: { skills: PickerOption[]; roles: PickerOption[]; capabilities: PickerOption[] };
  vocab: typeof FALLBACK_VOCAB;
  /** Distinct existing values, for free-text suggestions. */
  categories: { skills: string[]; achievements: string[] };
  /** Adds a skill to the index by name and returns its new id (used by "Create" in skill pickers). */
  createSkill: (name: string) => string | undefined;
}

const Ctx = createContext<EditorContextValue | null>(null);

export function useEditor() {
  const value = useContext(Ctx);
  if (!value) throw new Error('useEditor must be used inside <EditorProvider>');
  return value;
}

const distinct = (values: any[]) => [...new Set(values.filter((v) => typeof v === 'string' && v.trim()))].sort((a, b) => a.localeCompare(b));
const vocabOr = (list: any, fallback: string[]) => (Array.isArray(list) && list.length ? list : fallback);

export function EditorProvider({ open, children }: { open: EditorContextValue['open']; children: React.ReactNode }) {
  const cj = useStore((s) => s.careerJourney);
  const mutate = useStore((s) => s.mutateCareerJourney);

  const value = useMemo<EditorContextValue>(() => {
    const lookups = buildLookups(cj);
    const vocab = cj?.vocabularies || {};
    return {
      cj,
      lookups,
      items: buildSectionItems(cj),
      mutate,
      open,
      options: {
        skills: (cj?.skills_index || []).map((s: any) => ({ id: s.id, label: s.name || s.id, hint: s.category })),
        roles: (cj?.roles || []).map((r: any) => ({ id: r.id, label: roleLabel(r), hint: r.dates })),
        capabilities: (cj?.capabilities || []).map((c: any) => ({ id: c.id, label: c.name || c.id, hint: c.maturity_level })),
      },
      vocab: {
        proficiency_levels: vocabOr(vocab.proficiency_levels, FALLBACK_VOCAB.proficiency_levels),
        maturity_levels: vocabOr(vocab.maturity_levels, FALLBACK_VOCAB.maturity_levels),
        competency_levels: vocabOr(vocab.competency_levels, FALLBACK_VOCAB.competency_levels),
        value_stream_stages: vocabOr(vocab.value_stream_stages, FALLBACK_VOCAB.value_stream_stages),
      },
      categories: {
        skills: distinct((cj?.skills_index || []).map((s: any) => s.category)),
        achievements: distinct((cj?.achievements || []).map((a: any) => a.category)),
      },
      createSkill: (name) => mutate((d, ids) => mutations.addSkill(d, ids, { name })),
    };
  }, [cj, mutate, open]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
