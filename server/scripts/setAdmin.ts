import dotenv from 'dotenv';
import { initializeApp, App } from '../platform/app';
import { getAuth } from '../platform/auth';

dotenv.config();

/**
 * Grants (or revokes with --revoke) the `admin` custom claim used by
 * server/platform.ts's requireAdmin middleware to gate /api/admin/*.
 * Usage: npm run set:admin -- someone@example.com [--revoke]
 */
async function main() {
  const email = process.argv[2];
  const revoke = process.argv.includes('--revoke');

  if (!email || email.startsWith('--')) {
    console.error('Usage: npm run set:admin -- <email> [--revoke]');
    process.exit(1);
  }

  const app=initializeApp();

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
