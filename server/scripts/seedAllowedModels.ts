import dotenv from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { AllowedModelsConfig } from '../../src/types/aiModels';

dotenv.config();

// Initial seed per payment-system-plan.md Phase 4 — verified against live
// provider docs 2026-08-13 (Gemini/OpenAI from official docs; Anthropic from
// this app's own known-accurate model IDs). Re-verify before re-running if
// this hasn't been touched in a while — the model landscape moves fast, and
// this is exactly what the Phase 5 admin "Models" tab exists to keep current
// without needing this script again.
const SEED: AllowedModelsConfig = {
  gemini: [
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (flagship)', enabled: true },
    { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash (balanced, default)', enabled: true },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (cost-efficient)', enabled: true },
  ],
  openai: [
    { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol (flagship)', enabled: true },
    { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra (balanced, default)', enabled: true },
    { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna (cost-efficient)', enabled: true },
  ],
  anthropic: [
    { id: 'claude-opus-5', label: 'Claude Opus 5 (flagship)', enabled: true },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (balanced, default)', enabled: true },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (cost-efficient)', enabled: true },
  ],
};

/** Idempotent — safe to re-run; overwrites the whole doc with SEED above. */
async function main() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set in .env.');
    process.exit(1);
  }
  const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const app = initializeApp({ credential: cert(credentials) });
  await getFirestore(app).collection('config').doc('allowedModels').set(SEED);
  console.log('Seeded config/allowedModels:', JSON.stringify(SEED, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
