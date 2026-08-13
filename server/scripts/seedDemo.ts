import dotenv from 'dotenv';
import { initializeApp, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { DEMO_CAREER_JOURNEY, DEMO_JOBS, DEMO_MATCHES, DEMO_MATCH_PREFERENCES } from '../../src/lib/demo';

dotenv.config();

const DEMO_EMAIL = process.env.DEMO_EMAIL || 'demo@career-journey.app';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'DemoPass123!';

/**
 * Idempotent: safe to re-run any time you want to reset the demo account back
 * to a known-good state. Deletes and rewrites the demo user's entire Firestore
 * subtree, then upserts the Auth user. Never touches any other account.
 */
async function main() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set in .env — see the setup steps before running this script.');
    process.exit(1);
  }

  let app: App;
  try {
    const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    app = initializeApp({ credential: cert(credentials) });
  } catch (e) {
    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON — check it is the full service account JSON on one line.', e);
    process.exit(1);
    return;
  }

  const auth = getAuth(app);
  const db = getFirestore(app);

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

  console.log(`Seeded demo data for uid ${uid}: 1 career journey, ${DEMO_JOBS.length} jobs, ${DEMO_MATCHES.length} matches, 1 match-preferences doc.`);
  console.log(`Log in at the app with: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
