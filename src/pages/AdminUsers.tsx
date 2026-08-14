import React, { useEffect, useState } from 'react';
import { listAdminUsers, setUserComped, AdminUserRow } from '../lib/adminClient';
import { Badge, Button, useToast } from '../components/ui';
import { Loader2, Users } from 'lucide-react';

export default function AdminUsers() {
  const toast = useToast();
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const load = () => listAdminUsers().then(setUsers).catch((e) => toast.error(e.message));

  useEffect(() => { load(); }, []);

  const toggleComp = async (row: AdminUserRow) => {
    setBusyUid(row.uid);
    try {
      await setUserComped(row.uid, !row.comped);
      setUsers((prev) => prev!.map((u) => (u.uid === row.uid ? { ...u, comped: !row.comped } : u)));
      toast.success(`${row.email || row.uid} is now ${!row.comped ? 'comped' : 'un-comped'}.`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyUid(null);
    }
  };

  if (!users) {
    return <div className="max-w-5xl mx-auto px-4 py-12 text-center text-sm text-slate-500">Loading…</div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-4">
      <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
        <Users className="w-5 h-5 text-brand-500" /> Users ({users.length})
      </h1>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Free used</th>
              <th className="px-3 py-2">Pro used</th>
              <th className="px-3 py-2">BYOM</th>
              <th className="px-3 py-2">Comped</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.uid} className="border-t border-slate-100">
                <td className="px-3 py-2">{u.email || u.uid}</td>
                <td className="px-3 py-2"><Badge variant={u.plan === 'free' ? 'outline' : 'success'}>{u.plan}</Badge></td>
                <td className="px-3 py-2 text-slate-500">{u.subscriptionStatus || '—'}</td>
                <td className="px-3 py-2">{u.freeAiActionsUsed}/20</td>
                <td className="px-3 py-2">{u.proMonthlyAiActionsUsed}</td>
                <td className="px-3 py-2 text-slate-500">{u.byomProvider || '—'}</td>
                <td className="px-3 py-2">{u.comped ? <Badge variant="success">Comped</Badge> : '—'}</td>
                <td className="px-3 py-2">
                  <Button variant="outline" size="sm" disabled={busyUid === u.uid} onClick={() => toggleComp(u)}>
                    {busyUid === u.uid && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                    {u.comped ? 'Un-comp' : 'Comp'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
