import dotenv from 'dotenv';
dotenv.config();

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { PROMPT_OSO_ALIASES, DEFAULT_OSO_ALIAS } from '../ai/osoAliasMap';
import { PLATFORM_PROVIDERS } from '../../src/types/billing';
import { logAdminAction } from '../auditLog';

/**
 * Rewrites stored admin AI config from direct cloud providers to the Oso
 * router: config/aiDefaults, and each config/promptAiConfig modelOverride that
 * names a non-platform provider. Prompts with no override are also given their
 * recommended alias from osoAliasMap.ts.
 *
 * Dry run by default; pass --apply to write.  Usage: npm run migrate:oso [-- --apply]
 */
async function main() {
  const apply = process.argv.includes('--apply');
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set in .env.');
    process.exit(1);
  }
  const app = initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
  const db = getFirestore(app);
  const isPlatform = (p: unknown) => PLATFORM_PROVIDERS.includes(p as any);
  const changes: string[] = [];

  const defaultsRef = db.collection('config').doc('aiDefaults');
  const defaults = (await defaultsRef.get()).data() as { provider?: string; model?: string } | undefined;
  const newDefaults = { provider: 'oso', model: process.env.OSO_DEFAULT_MODEL || DEFAULT_OSO_ALIAS };
  // An unset doc already resolves to Oso via env (defaultAiDefaults), so only a stored non-platform provider needs rewriting.
  if (defaults && !isPlatform(defaults.provider)) {
    changes.push(`aiDefaults: ${defaults.provider}/${defaults.model} -> oso:${newDefaults.model}`);
    if (apply) await defaultsRef.set(newDefaults);
  }

  const promptsRef = db.collection('config').doc('promptAiConfig');
  const promptConfigs = ((await promptsRef.get()).data() || {}) as Record<string, any>;
  const updates: Record<string, any> = {};
  for (const [id, alias] of Object.entries(PROMPT_OSO_ALIASES)) {
    const current = promptConfigs[id]?.modelOverride as { provider: string; model: string } | null | undefined;
    if (!current || !isPlatform(current.provider)) {
      changes.push(`prompt ${id}: ${current ? `${current.provider}/${current.model}` : '(default)'} -> oso:${alias}`);
      updates[id] = { includedKnowledge: null, careerJourneyFields: null, ...(promptConfigs[id] || {}), modelOverride: { provider: 'oso', model: alias } };
    }
  }
  // Also clear stale direct-provider overrides on prompts that aren't in the alias map.
  for (const [id, cfg] of Object.entries(promptConfigs)) {
    if (!(id in PROMPT_OSO_ALIASES) && cfg?.modelOverride && !isPlatform(cfg.modelOverride.provider)) {
      changes.push(`prompt ${id}: ${cfg.modelOverride.provider}/${cfg.modelOverride.model} -> (inherit default)`);
      updates[id] = { ...cfg, modelOverride: null };
    }
  }
  if (apply && Object.keys(updates).length) await promptsRef.set(updates, { merge: true });

  console.log(changes.length ? changes.join('\n') : 'Nothing to migrate.');
  if (!apply) console.log('\nDry run — re-run with --apply to write these changes.');
  else if (changes.length) {
    await logAdminAction(app, { actorUid: 'script:migrate-oso', targetUid: 'platform', action: 'update_ai_defaults', details: { changes } });
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
