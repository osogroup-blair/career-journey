import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON as string);
const app = initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth(app);
const db = getFirestore(app);

const emailsToDelete = [
  'test-signup-verify@career-journey.app',
  'phase2-free-test@career-journey.app'
];

async function run() {
  for (const email of emailsToDelete) {
    try {
      const user = await auth.getUserByEmail(email);
      console.log(`Found user ${email} with uid ${user.uid}. Deleting...`);
      await auth.deleteUser(user.uid);
      await db.collection('users').doc(user.uid).delete();
      console.log(`Deleted user ${email}`);
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        console.log(`User ${email} not found, skipping.`);
      } else {
        console.error(`Error deleting user ${email}:`, error);
      }
    }
  }
  process.exit(0);
}

run();
