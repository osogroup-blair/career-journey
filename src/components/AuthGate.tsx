import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, User } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { setDataStore } from '../data';
import { FirestoreDataStore } from '../data/FirestoreDataStore';
import { useStore } from '../store';
import { Button, Input, Label } from './ui';
import { Loader2, Lock } from 'lucide-react';

function FullScreenStatus({ label }: { label: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex items-center gap-2 text-slate-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> {label}
      </div>
    </div>
  );
}

/**
 * Gates the app behind Firebase Auth when Firebase is configured (see lib/firebase.ts).
 * There is deliberately no sign-up form here — this app is scoped to one pre-provisioned
 * account, created once via the Firebase Console's Authentication tab. Firestore security
 * rules can only scope data safely by request.auth.uid, so this exists for that reason
 * even though the app itself stays single-user.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = still checking
  const [hydrated, setHydrated] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    let cancelled = false;
    setDataStore(new FirestoreDataStore(db, user.uid));
    useStore.getState().hydrate().then(() => {
      if (!cancelled) setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) return;
    setIsSubmitting(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setError(err?.message || 'Sign-in failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (user === undefined) {
    return <FullScreenStatus label="Checking session…" />;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 text-brand-600">
            <Lock className="w-5 h-5" />
            <h1 className="text-lg font-bold text-slate-900">Sign in</h1>
          </div>
          <p className="text-xs text-slate-500">This app's data is private. Sign in with the account it was set up for.</p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <Button type="submit" disabled={isSubmitting} className="w-full flex items-center justify-center gap-2">
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Sign In
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (!hydrated) {
    return <FullScreenStatus label="Loading your data…" />;
  }

  return <>{children}</>;
}
