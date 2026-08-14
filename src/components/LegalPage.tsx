import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Shared wrapper for /terms, /privacy, /refunds. The draft-notice banner is
 * deliberate and should stay until a real attorney has reviewed the content
 * — these were drafted by Claude, not counsel, and Blair (not Claude) is the
 * one who can authorize removing this notice once that review happens.
 */
export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          <strong>Draft — not legal advice.</strong> This page was drafted as a starting template, not reviewed by an
          attorney. Have it reviewed before relying on it for real payments or real users.
        </span>
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">{title}</h1>
      <p className="text-xs text-slate-400 mb-6">Last updated {updated}</p>
      <div className="prose prose-sm prose-slate max-w-none space-y-4 text-sm text-slate-700 leading-relaxed">
        {children}
      </div>
    </div>
  );
}
