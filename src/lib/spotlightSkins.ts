import type { SpotlightSkin } from '../types/spotlight';

/**
 * The five Spotlight templates. Every skin renders the same components (so evidence,
 * print and accessibility behave the same everywhere); spotlight.css gives each its own
 * type, neutrals and layout under .sp[data-skin=…]. The few structural differences that
 * CSS can't express are flags here.
 *
 * `paper`/`band` mirror spotlight.css so the tests can check every accent against every
 * skin's backgrounds — keep them in sync when changing a skin's colours.
 */
export interface SpotlightSkinInfo {
  id: SpotlightSkin;
  name: string;
  /** Who it suits, in the editor's template picker. */
  suits: string;
  description: string;
  /** 'bars' draws roles as a staircase timeline; 'log' lists them, newest first, with dates. */
  arc: 'bars' | 'log';
  paper: { light: string; dark: string };
  /** Backgrounds the accent also sits on (Executive's introduction band). */
  band?: { light: string; dark: string };
}

export const SPOTLIGHT_SKIN_INFO: Record<SpotlightSkin, SpotlightSkinInfo> = {
  editorial: {
    id: 'editorial',
    name: 'Editorial',
    suits: 'Product, strategy, generalists',
    description: 'A magazine profile: serif headlines, generous space, and a staircase timeline of your roles.',
    arc: 'bars',
    paper: { light: '#f5f7fa', dark: '#0d121a' },
  },
  executive: {
    id: 'executive',
    name: 'Executive',
    suits: 'Directors, VPs, consulting',
    description: 'A board-ready brief: a dark introduction band, results set as a figures row, tight and formal.',
    arc: 'bars',
    paper: { light: '#f4f5f7', dark: '#0b0f15' },
    band: { light: '#0f1722', dark: '#162131' },
  },
  studio: {
    id: 'studio',
    name: 'Studio',
    suits: 'Design, marketing, creative',
    description: 'Bold and graphic: an oversized name, outcomes as colour tiles, rounded cards.',
    arc: 'bars',
    paper: { light: '#ffffff', dark: '#0f0f12' },
  },
  technical: {
    id: 'technical',
    name: 'Technical',
    suits: 'Engineering, data, infrastructure',
    description: 'Reads like a well-kept README: monospace headings, your career as a log, square edges.',
    arc: 'log',
    paper: { light: '#f7f8f8', dark: '#0e1113' },
  },
  classic: {
    id: 'classic',
    name: 'Classic',
    suits: 'Finance, law, academia, public sector',
    description: 'A traditionally typeset CV: centred, one column, Garamond throughout.',
    arc: 'log',
    paper: { light: '#ffffff', dark: '#121212' },
  },
};

export const skinInfo = (skin: SpotlightSkin | undefined): SpotlightSkinInfo => SPOTLIGHT_SKIN_INFO[skin ?? 'editorial'] ?? SPOTLIGHT_SKIN_INFO.editorial;
