import React from 'react';
import { useStore } from '../store';
import { ShieldAlert } from 'lucide-react';

/**
 * Client-side gate for admin pages — purely a UX nicety. The server already
 * enforces this for real via requireAdmin (server/firebaseAdmin.ts) on every
 * /api/admin/* route; this just avoids showing a non-admin a half-broken page
 * full of failed requests instead of a clear message.
 */
export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const isAdmin = useStore((s) => s.isAdmin);

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm text-center space-y-3">
          <ShieldAlert className="w-8 h-8 text-slate-400 mx-auto" />
          <h1 className="text-lg font-bold text-slate-900">Admin access required</h1>
          <p className="text-sm text-slate-500">This page is only available to admin accounts.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
