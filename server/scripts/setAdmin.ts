import dotenv from 'dotenv';
import { initializeApp, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

dotenv.config();

/**
 * Grants (or revokes with --revoke) the `admin` custom claim used by
 * server/firebaseAdmin.ts's requireAdmin middleware to gate /api/admin/*.
 * Usage: npm run set:admin -- someone@example.com [--revoke]
 */
async function main() {
  const email = process.argv[2];
  const revoke = process.argv.includes('--revoke');

  if (!email || email.startsWith('--')) {
    console.error('Usage: npm run set:admin -- <email> [--revoke]');
    process.exit(1);
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set in .env — see README\'s Firebase setup steps.');
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
  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, { admin: revoke ? null : true });

  console.log(`${revoke ? 'Revoked' : 'Granted'} admin claim for ${email} (uid ${user.uid}).`);
  console.log('They must sign out and back in (or wait for their ID token to refresh, ~1h) for this to take effect.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed to update admin claim:', err);
    process.exit(1);
  });
