import dotenv from 'dotenv';
import { initializeApp, App } from '../platform/app';
import { getAuth } from '../platform/auth';
import { getDatabase } from '../platform/database';
import { DEMO_CAREER_JOURNEY, DEMO_JOBS, DEMO_MATCHES, DEMO_MATCH_PREFERENCES } from '../../src/lib/demo';

dotenv.config();

const DEMO_EMAIL = process.env.DEMO_EMAIL || 'demo@career-journey.app';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
if(!DEMO_PASSWORD)throw new Error('Set a strong DEMO_PASSWORD before seeding a demo account');

/**
 * Idempotent: safe to re-run any time you want to reset the demo account back
 * to a known-good state. Deletes and rewrites the demo user's entire SQLite
 * subtree, then upserts the Auth user. Never touches any other account.
 */
async function main() {

  const app=initializeApp();

  const auth = getAuth(app);
  const db = getDatabase(app);

  let uid: string;
  try {
    const existing = await auth.getUserByEmail(DEMO_EMAIL);
    uid = existing.uid;
    await auth.updateUser(uid, { password: DEMO_PASSWORD });
    console.log(`Demo Auth user already existed (${DEMO_EMAIL}) — password reset to the configured value.`);
  } catch {
    const created = await auth.createUser({ email: DEMO_EMAIL, password: DEMO_PASSWORD, emailVerified: true });
    uid = created.uid;
    console.log(`Created demo Auth user ${DEMO_EMAIL}.`);
  }

  const userRoot = db.collection('users').doc(uid);

  // Clear any previously-seeded jobs/matches so re-runs don't leave stale docs
  // behind (e.g. if a fixture's set of ids changes between runs).
  for (const sub of ['jobs', 'matches'] as const) {
    const snap = await userRoot.collection(sub).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }

  await userRoot.collection('careerJourney').doc('current').set(DEMO_CAREER_JOURNEY as any);
  await userRoot.collection('matchPreferences').doc('current').set(DEMO_MATCH_PREFERENCES as any);
  await Promise.all(DEMO_JOBS.map((job) => userRoot.collection('jobs').doc(job.id).set(job as any)));
  await Promise.all(DEMO_MATCHES.map((match) => userRoot.collection('matches').doc(match.id).set(match as any)));

  // Pre-comped (payment-system-plan.md Phase 5) — "Try the demo" is a sales
  // surface, so it should always show the full Pro experience (Matches
  // included) rather than hitting the same paywall a real free user would.
  await userRoot.collection('meta').doc('billing').set(
    { plan: 'pro_monthly', comped: true },
    { merge: true }
  );

  console.log(`Seeded demo data for uid ${uid}: 1 career journey, ${DEMO_JOBS.length} jobs, ${DEMO_MATCHES.length} matches, 1 match-preferences doc, comped billing.`);
  console.log(`Log in at the app with: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
