import React, { useEffect, useState } from 'react';
import {
  listAdminUsers,
  setUserComped,
  setUserPlan,
  resetUserQuota,
  getUserDetail,
  setUserDisabledStatus,
  sendUserPasswordReset,
  deleteAdminUser,
  listAdminAuditLogs,
  setUserAdminRole,
  AdminUserRow,
  AdminUserDetail,
  AdminAuditLog,
} from '../lib/adminClient';
import { Badge, Button, useToast, Input, Card, CardHeader, CardTitle, CardContent } from '../components/ui';
import {
  Loader2,
  Users,
  RotateCcw,
  Zap,
  Search,
  ShieldCheck,
  ShieldAlert,
  UserX,
  UserCheck,
  Shield,
  Send,
  Trash2,
  X,
  ExternalLink,
  Briefcase,
  Radar,
  MessageSquare,
  Copy,
  Check,
  Calendar,
  Clock,
  Mail,
  Sparkles,
  TrendingUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Layers,
  History,
  Activity,
} from 'lucide-react';
import { PlanId } from '../types/billing';

const PLAN_OPTIONS: { id: PlanId; label: string }[] = [
  { id: 'free', label: 'Free' },
  { id: 'pro_monthly', label: 'Pro Monthly' },
  { id: 'byom_monthly', label: 'BYOM Monthly' },
  { id: 'byom_yearly', label: 'BYOM Yearly' },
];

type PlanFilterType = 'all' | 'free' | 'pro_monthly' | 'byom' | 'comped' | 'admin';
type StatusFilterType = 'all' | 'active' | 'suspended';
type SortFieldType = 'createdAt' | 'name' | 'freeUsed' | 'proUsed';

export default function AdminUsers() {
  const toast = useToast();
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [busyUid, setBusyUid] = useState<string | null>(null);

  // Filters & Sorting state
  const [planFilter, setPlanFilter] = useState<PlanFilterType>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('all');
  const [sortField, setSortField] = useState<SortFieldType>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Selected User Detail Drawer state
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [userDetail, setUserDetail] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [drawerBusy, setDrawerBusy] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAdminConfirm, setShowAdminConfirm] = useState(false);

  // Audit Logs Drawer state
  const [auditDrawerOpen, setAuditDrawerOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[] | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  const load = () => listAdminUsers().then(setUsers).catch((e) => toast.error(e.message));

  const openAuditDrawer = async () => {
    setAuditDrawerOpen(true);
    setAuditLoading(true);
    try {
      const logs = await listAdminAuditLogs();
      setAuditLogs(logs);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load audit logs');
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, planFilter, statusFilter, sortField, sortDirection]);

  const openDrawer = async (uid: string) => {
    setSelectedUid(uid);
    setDetailLoading(true);
    setShowDeleteConfirm(false);
    setShowAdminConfirm(false);
    try {
      const detail = await getUserDetail(uid);
      setUserDetail(detail);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load user detail');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDrawer = () => {
    setSelectedUid(null);
    setUserDetail(null);
    setShowDeleteConfirm(false);
  };

  const handlePlanChange = async (row: AdminUserRow, newPlan: PlanId) => {
    if (row.plan === newPlan) return;
    setBusyUid(row.uid);
    try {
      await setUserPlan(row.uid, newPlan);
      setUsers((prev) => prev!.map((u) => (u.uid === row.uid ? { ...u, plan: newPlan } : u)));
      if (userDetail && userDetail.user.uid === row.uid) {
        setUserDetail({ ...userDetail, billing: { ...userDetail.billing, plan: newPlan } });
      }
      toast.success(`Updated plan to ${PLAN_OPTIONS.find((p) => p.id === newPlan)?.label}.`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to update user plan');
    } finally {
      setBusyUid(null);
    }
  };

  const toggleComp = async (row: AdminUserRow) => {
    setBusyUid(row.uid);
    try {
      await setUserComped(row.uid, !row.comped);
      setUsers((prev) => prev!.map((u) => (u.uid === row.uid ? { ...u, comped: !row.comped } : u)));
      if (userDetail && userDetail.user.uid === row.uid) {
        setUserDetail({ ...userDetail, billing: { ...userDetail.billing, comped: !row.comped } });
      }
      toast.success(`${row.email || row.uid} is now ${!row.comped ? 'comped' : 'un-comped'}.`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyUid(null);
    }
  };

  const handleResetQuota = async (row: AdminUserRow) => {
    setBusyUid(row.uid);
    try {
      await resetUserQuota(row.uid, 'all');
      setUsers((prev) =>
        prev!.map((u) =>
          u.uid === row.uid
            ? {
                ...u,
                freeAiActionsUsed: 0,
                proMonthlyAiActionsUsed: 0,
              }
            : u
        )
      );
      if (userDetail && userDetail.user.uid === row.uid) {
        setUserDetail({
          ...userDetail,
          billing: {
            ...userDetail.billing,
            freeAiActionsUsed: 0,
            proMonthlyAiActionsUsed: 0,
          },
        });
      }
      toast.success(`Reset AI action quotas for ${row.email || row.uid}.`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to reset quota');
    } finally {
      setBusyUid(null);
    }
  };

  const handleToggleDisabled = async () => {
    if (!userDetail) return;
    const targetState = !userDetail.user.disabled;
    setDrawerBusy(true);
    try {
      await setUserDisabledStatus(userDetail.user.uid, targetState);
      setUserDetail({
        ...userDetail,
        user: { ...userDetail.user, disabled: targetState },
      });
      setUsers(
        (prev) =>
          prev?.map((u) => (u.uid === userDetail.user.uid ? { ...u, disabled: targetState } : u)) ?? null
      );
      toast.success(targetState ? 'User account has been suspended.' : 'User account has been reactivated.');
    } catch (e: any) {
      toast.error(e.message || 'Failed to update user status');
    } finally {
      setDrawerBusy(false);
    }
  };

  const handleToggleAdminRole = async () => {
    if (!userDetail) return;
    const targetAdminState = !userDetail.user.isAdmin;
    setDrawerBusy(true);
    try {
      const res = await setUserAdminRole(userDetail.user.uid, targetAdminState);
      setUserDetail({
        ...userDetail,
        user: { ...userDetail.user, isAdmin: res.isAdmin },
      });
      setUsers(
        (prev) =>
          prev?.map((u) => (u.uid === userDetail.user.uid ? { ...u, isAdmin: res.isAdmin } : u)) ?? null
      );
      setShowAdminConfirm(false);
      toast.success(
        targetAdminState
          ? 'Admin role granted — takes effect upon their next token refresh / sign-in.'
          : 'Admin role revoked.'
      );
    } catch (e: any) {
      toast.error(e.message || 'Failed to update admin role');
    } finally {
      setDrawerBusy(false);
    }
  };

  const handleSendReset = async () => {
    if (!userDetail) return;
    setDrawerBusy(true);
    try {
      const res = await sendUserPasswordReset(userDetail.user.uid);
      if (res.resetLink) {
        toast.success('Password reset link generated and email dispatched.');
      } else {
        toast.success('Password reset email sent successfully.');
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to send password reset email');
    } finally {
      setDrawerBusy(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userDetail) return;
    setDrawerBusy(true);
    try {
      await deleteAdminUser(userDetail.user.uid);
      setUsers((prev) => prev!.filter((u) => u.uid !== userDetail.user.uid));
      toast.success(`Permanently deleted user account ${userDetail.user.email || userDetail.user.uid}.`);
      closeDrawer();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete user account');
    } finally {
      setDrawerBusy(false);
    }
  };

  const handleSort = (field: SortFieldType) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleCopyUid = (uid: string) => {
    navigator.clipboard.writeText(uid);
    setCopiedUid(true);
    toast.success('User ID copied to clipboard');
    setTimeout(() => setCopiedUid(false), 2000);
  };

  if (!users) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
        Loading user accounts…
      </div>
    );
  }

  // KPI Calculations
  const totalUsersCount = users.length;
  const proCount = users.filter((u) => u.plan === 'pro_monthly').length;
  const byomCount = users.filter((u) => u.plan.startsWith('byom')).length;
  const compedCount = users.filter((u) => u.comped).length;
  const totalAiActionsConsumed = users.reduce(
    (sum, u) => sum + (u.freeAiActionsUsed || 0) + (u.proMonthlyAiActionsUsed || 0),
    0
  );

  // Filtering
  const filteredUsers = users.filter((u) => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const match =
        (u.email && u.email.toLowerCase().includes(query)) ||
        (u.displayName && u.displayName.toLowerCase().includes(query)) ||
        u.uid.toLowerCase().includes(query);
      if (!match) return false;
    }

    if (planFilter === 'free' && u.plan !== 'free') return false;
    if (planFilter === 'pro_monthly' && u.plan !== 'pro_monthly') return false;
    if (planFilter === 'byom' && !u.plan.startsWith('byom')) return false;
    if (planFilter === 'comped' && !u.comped) return false;
    if (planFilter === 'admin' && !u.isAdmin) return false;

    if (statusFilter === 'active' && u.disabled) return false;
    if (statusFilter === 'suspended' && !u.disabled) return false;

    return true;
  });

  // Sorting
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    let diff = 0;
    if (sortField === 'createdAt') {
      diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    } else if (sortField === 'name') {
      const nameA = a.displayName || a.email || a.uid;
      const nameB = b.displayName || b.email || b.uid;
      diff = nameA.localeCompare(nameB);
    } else if (sortField === 'freeUsed') {
      diff = (b.freeAiActionsUsed || 0) - (a.freeAiActionsUsed || 0);
    } else if (sortField === 'proUsed') {
      diff = (b.proMonthlyAiActionsUsed || 0) - (a.proMonthlyAiActionsUsed || 0);
    }
    return sortDirection === 'asc' ? -diff : diff;
  });

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedUsers.length / pageSize));
  const paginatedUsers = sortedUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const startRange = (currentPage - 1) * pageSize + 1;
  const endRange = Math.min(sortedUsers.length, currentPage * pageSize);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-6 relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-brand-600" /> User Accounts & Analytics
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Monitor account metrics, manage subscription plans, comp access, and moderate {users.length} registered accounts.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search email, name, or UID…"
              className="pl-9 text-sm"
            />
          </div>
          <Button
            variant="outline"
            onClick={openAuditDrawer}
            className="text-xs h-9 px-3 shrink-0 flex items-center gap-1.5"
          >
            <History className="w-4 h-4 text-slate-500" />
            Audit Trail
          </Button>
        </div>
      </div>

      {/* Top-Level KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>Total Accounts</span>
            <Users className="w-4 h-4 text-brand-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalUsersCount}</div>
          <div className="text-[11px] text-slate-400">Registered users</div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>Pro Monthly</span>
            <Sparkles className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{proCount}</div>
          <div className="text-[11px] text-slate-400">Subscribers</div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>BYOM Plans</span>
            <Layers className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{byomCount}</div>
          <div className="text-[11px] text-slate-400">Own API key users</div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>AI Operations</span>
            <TrendingUp className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalAiActionsConsumed}</div>
          <div className="text-[11px] text-slate-400">Total actions tracked</div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>Comped VIPs</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{compedCount}</div>
          <div className="text-[11px] text-slate-400">Unlimited access</div>
        </div>
      </div>

      {/* Multi-Attribute Filter Pills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        {/* Plan Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Plan:
          </span>
          {(
            [
              { id: 'all', label: 'All Plans' },
              { id: 'free', label: 'Free' },
              { id: 'pro_monthly', label: 'Pro Monthly' },
              { id: 'byom', label: 'BYOM' },
              { id: 'comped', label: 'Comped' },
              { id: 'admin', label: 'Admins' },
            ] as { id: PlanFilterType; label: string }[]
          ).map((pill) => (
            <button
              key={pill.id}
              onClick={() => setPlanFilter(pill.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                planFilter === pill.id
                  ? 'bg-brand-600 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">Status:</span>
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'active', label: 'Active' },
              { id: 'suspended', label: 'Suspended' },
            ] as { id: StatusFilterType; label: string }[]
          ).map((pill) => (
            <button
              key={pill.id}
              onClick={() => setStatusFilter(pill.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === pill.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('name')}>
                <div className="flex items-center gap-1">
                  <span>Account</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="px-4 py-3">Plan Override</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('freeUsed')}>
                <div className="flex items-center gap-1">
                  <span>Free Quota</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('proUsed')}>
                <div className="flex items-center gap-1">
                  <span>Pro Month</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="px-4 py-3">BYOM</th>
              <th className="px-4 py-3">Comped</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedUsers.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                  No accounts match your search and filter criteria.
                </td>
              </tr>
            ) : (
              paginatedUsers.map((u) => {
                const isBusy = busyUid === u.uid;
                return (
                  <tr key={u.uid} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => openDrawer(u.uid)}
                          className="font-medium text-slate-900 hover:text-brand-600 text-left transition-colors"
                        >
                          {u.displayName || u.email || 'Anonymous User'}
                        </button>
                        {u.isAdmin && (
                          <Badge variant="outline" className="text-[10px] text-purple-700 border-purple-200 bg-purple-50 flex items-center gap-1 font-semibold">
                            <Shield className="w-2.5 h-2.5" /> Admin
                          </Badge>
                        )}
                        {u.disabled && (
                          <Badge variant="outline" className="text-[10px] text-red-600 border-red-200 bg-red-50">
                            Suspended
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 font-mono truncate max-w-[150px]" title={u.uid}>
                        {u.email || u.uid}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.plan}
                        disabled={isBusy}
                        onChange={(e) => handlePlanChange(u, e.target.value as PlanId)}
                        className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-slate-800 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none"
                      >
                        {PLAN_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {u.subscriptionStatus ? (
                        <Badge variant={u.subscriptionStatus === 'active' ? 'success' : 'outline'} className="capitalize text-xs">
                          {u.subscriptionStatus}
                        </Badge>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={u.freeAiActionsUsed >= 20 ? 'text-amber-600 font-semibold' : 'text-slate-700'}>
                        {u.freeAiActionsUsed} / 20
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-700 font-medium">{u.proMonthlyAiActionsUsed}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {u.byomProvider ? (
                        <span className="capitalize font-medium text-slate-700">{u.byomProvider}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.comped ? (
                        <Badge variant="success" className="inline-flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" /> Comped
                        </Badge>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDrawer(u.uid)}
                          className="h-8 px-2 text-xs text-brand-600 hover:text-brand-700 hover:bg-brand-50"
                        >
                          Manage
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isBusy}
                          onClick={() => handleResetQuota(u)}
                          title="Reset consumed AI actions"
                          className="h-8 px-2 text-xs text-slate-600 hover:text-slate-900"
                        >
                          <RotateCcw className="w-3.5 h-3.5 mr-1 text-slate-400" />
                          Reset
                        </Button>
                        <Button
                          variant={u.comped ? 'outline' : 'secondary'}
                          size="sm"
                          disabled={isBusy}
                          onClick={() => toggleComp(u)}
                          className="h-8 px-2.5 text-xs"
                        >
                          {isBusy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <Zap className="w-3.5 h-3.5" />
                              {u.comped ? 'Un-comp' : 'Comp'}
                            </span>
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {sortedUsers.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500 pt-1">
          <div>
            Showing <span className="font-semibold text-slate-700">{startRange}</span> to{' '}
            <span className="font-semibold text-slate-700">{endRange}</span> of{' '}
            <span className="font-semibold text-slate-700">{sortedUsers.length}</span> accounts
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="h-7 px-2 text-xs"
            >
              <ChevronLeft className="w-3.5 h-3.5 mr-0.5" /> Previous
            </Button>
            <span className="px-2 py-1 font-medium text-slate-700">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="h-7 px-2 text-xs"
            >
              Next <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Slide-over User Detail Drawer */}
      {selectedUid && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-brand-500 to-indigo-600 text-white font-bold text-lg flex items-center justify-center shadow-xs">
                  {userDetail?.user.displayName
                    ? userDetail.user.displayName.charAt(0).toUpperCase()
                    : userDetail?.user.email
                    ? userDetail.user.email.charAt(0).toUpperCase()
                    : 'U'}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 leading-tight">
                    {userDetail?.user.displayName || userDetail?.user.email || 'User Details'}
                  </h2>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 pt-0.5">
                    <span className="font-mono">{selectedUid}</span>
                    <button
                      onClick={() => handleCopyUid(selectedUid)}
                      className="text-slate-400 hover:text-slate-700 transition-colors p-0.5"
                      title="Copy UID"
                    >
                      {copiedUid ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
              <button
                onClick={closeDrawer}
                className="rounded-lg p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {detailLoading || !userDetail ? (
                <div className="py-20 text-center text-sm text-slate-500 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
                  Loading account context…
                </div>
              ) : (
                <>
                  {/* Account Status Badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={userDetail.user.disabled ? 'outline' : 'success'} className={userDetail.user.disabled ? 'border-red-300 text-red-700 bg-red-50' : ''}>
                      {userDetail.user.disabled ? 'Account Suspended' : 'Active Account'}
                    </Badge>
                    <Badge variant={userDetail.user.emailVerified ? 'success' : 'outline'} className="text-xs">
                      {userDetail.user.emailVerified ? 'Email Verified' : 'Email Unverified'}
                    </Badge>
                    {userDetail.billing.comped && (
                      <Badge variant="success" className="text-xs inline-flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> Comped
                      </Badge>
                    )}
                  </div>

                  {/* Activity Stats Cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 text-center">
                      <div className="text-xs font-semibold text-slate-500 uppercase flex items-center justify-center gap-1">
                        <Briefcase className="w-3.5 h-3.5 text-slate-400" /> Jobs
                      </div>
                      <div className="text-xl font-bold text-slate-900 mt-1">{userDetail.stats.jobsCount}</div>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 text-center">
                      <div className="text-xs font-semibold text-slate-500 uppercase flex items-center justify-center gap-1">
                        <Radar className="w-3.5 h-3.5 text-slate-400" /> Matches
                      </div>
                      <div className="text-xl font-bold text-slate-900 mt-1">{userDetail.stats.matchesCount}</div>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 text-center">
                      <div className="text-xs font-semibold text-slate-500 uppercase flex items-center justify-center gap-1">
                        <MessageSquare className="w-3.5 h-3.5 text-slate-400" /> Tickets
                      </div>
                      <div className="text-xl font-bold text-slate-900 mt-1">{userDetail.stats.ticketsCount}</div>
                    </div>
                  </div>

                  {/* Plan & Quota Management */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-amber-500" />
                        Plan & Quota Controls
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 text-xs font-medium">Subscription Plan</span>
                        <select
                          value={userDetail.billing.plan}
                          disabled={drawerBusy}
                          onChange={(e) => {
                            const row = users.find((u) => u.uid === userDetail.user.uid);
                            if (row) handlePlanChange(row, e.target.value as PlanId);
                          }}
                          className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1 text-slate-800 focus:ring-1 focus:ring-brand-500"
                        >
                          {PLAN_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-slate-600">
                          <span>Free AI Actions Used</span>
                          <span className="font-semibold">{userDetail.billing.freeAiActionsUsed} / 20</span>
                        </div>
                        <div className="flex justify-between text-xs text-slate-600">
                          <span>Pro Monthly Actions Used</span>
                          <span className="font-semibold">{userDetail.billing.proMonthlyAiActionsUsed} / 100</span>
                        </div>
                      </div>

                      <div className="pt-1 flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={drawerBusy}
                          onClick={() => {
                            const row = users.find((u) => u.uid === userDetail.user.uid);
                            if (row) handleResetQuota(row);
                          }}
                          className="w-full text-xs"
                        >
                          <RotateCcw className="w-3.5 h-3.5 mr-1 text-slate-400" />
                          Reset All Quotas
                        </Button>
                        <Button
                          variant={userDetail.billing.comped ? 'outline' : 'secondary'}
                          size="sm"
                          disabled={drawerBusy}
                          onClick={() => {
                            const row = users.find((u) => u.uid === userDetail.user.uid);
                            if (row) toggleComp(row);
                          }}
                          className="w-full text-xs"
                        >
                          <Zap className="w-3.5 h-3.5 mr-1" />
                          {userDetail.billing.comped ? 'Un-comp' : 'Comp Access'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Timestamps & Info */}
                  <div className="space-y-2 text-xs text-slate-500 border border-slate-100 rounded-xl p-3.5 bg-slate-50/40">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-slate-400" /> Email:
                      </span>
                      <span className="font-medium text-slate-800">{userDetail.user.email || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" /> Registered:
                      </span>
                      <span className="text-slate-700">
                        {new Date(userDetail.user.creationTime).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" /> Last Sign-in:
                      </span>
                      <span className="text-slate-700">
                        {userDetail.user.lastSignInTime
                          ? new Date(userDetail.user.lastSignInTime).toLocaleString()
                          : 'Never'}
                      </span>
                    </div>
                  </div>

                  {/* Moderation Actions */}
                  <div className="space-y-3 pt-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Moderation & Security</h3>

                    {/* Administrator Role Management */}
                    <div className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/50 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-purple-100 text-purple-700">
                            <Shield className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-purple-900">Administrator Role</div>
                            <div className="text-[11px] text-purple-700">
                              {userDetail.user.isAdmin ? 'Full console and bypass privileges active' : 'Standard user account'}
                            </div>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            userDetail.user.isAdmin
                              ? 'bg-purple-100 text-purple-800 border-purple-300 font-semibold'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }
                        >
                          {userDetail.user.isAdmin ? 'Admin' : 'Standard'}
                        </Badge>
                      </div>

                      {!showAdminConfirm ? (
                        <Button
                          variant={userDetail.user.isAdmin ? 'outline' : 'default'}
                          size="sm"
                          disabled={drawerBusy}
                          onClick={() => setShowAdminConfirm(true)}
                          className={`w-full text-xs h-8 ${
                            userDetail.user.isAdmin
                              ? 'text-purple-800 border-purple-300 hover:bg-purple-100'
                              : 'bg-purple-600 hover:bg-purple-700 text-white'
                          }`}
                        >
                          <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                          {userDetail.user.isAdmin ? 'Revoke Admin Privileges' : 'Grant Admin Privileges'}
                        </Button>
                      ) : (
                        <div className="pt-2 border-t border-purple-200 space-y-2">
                          <p className="text-[11px] text-purple-800 font-medium leading-relaxed">
                            {userDetail.user.isAdmin
                              ? 'Are you sure you want to revoke admin privileges for this user? They will lose access to all admin tools.'
                              : 'Granting admin privileges gives this account full access to user management, feature flags, support tickets, and system overrides.'}
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              disabled={drawerBusy}
                              onClick={handleToggleAdminRole}
                              className={`text-xs h-7 ${
                                userDetail.user.isAdmin
                                  ? 'bg-red-600 hover:bg-red-700 text-white'
                                  : 'bg-purple-600 hover:bg-purple-700 text-white'
                              }`}
                            >
                              {drawerBusy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                              {userDetail.user.isAdmin ? 'Confirm Revoke' : 'Confirm Grant'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={drawerBusy}
                              onClick={() => setShowAdminConfirm(false)}
                              className="text-xs h-7"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Button
                        variant={userDetail.user.disabled ? 'default' : 'outline'}
                        onClick={handleToggleDisabled}
                        disabled={drawerBusy}
                        className="w-full text-xs justify-start"
                      >
                        {drawerBusy ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : userDetail.user.disabled ? (
                          <UserCheck className="w-4 h-4 mr-2 text-emerald-600" />
                        ) : (
                          <UserX className="w-4 h-4 mr-2 text-red-500" />
                        )}
                        {userDetail.user.disabled ? 'Reactivate User Account' : 'Suspend / Disable User Account'}
                      </Button>

                      <Button
                        variant="outline"
                        onClick={handleSendReset}
                        disabled={drawerBusy || !userDetail.user.email}
                        className="w-full text-xs justify-start"
                      >
                        {drawerBusy ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4 mr-2 text-slate-400" />
                        )}
                        Email Password Reset Link
                      </Button>

                      {/* Danger Zone: Delete User */}
                      <div className="pt-2">
                        {!showDeleteConfirm ? (
                          <Button
                            variant="ghost"
                            onClick={() => setShowDeleteConfirm(true)}
                            className="w-full text-xs text-red-600 hover:bg-red-50 hover:text-red-700 justify-start"
                          >
                            <Trash2 className="w-4 h-4 mr-2 text-red-500" />
                            Delete Account Permanently
                          </Button>
                        ) : (
                          <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 space-y-2.5">
                            <div className="text-xs font-semibold text-red-900 flex items-center gap-1.5">
                              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                              Are you sure you want to permanently delete this account?
                            </div>
                            <p className="text-[11px] text-red-700">
                              This action will immediately delete the Firebase Auth user and all associated Firestore data. This cannot be undone.
                            </p>
                            <div className="flex items-center gap-2 pt-1">
                              <Button
                                variant="default"
                                size="sm"
                                disabled={drawerBusy}
                                onClick={handleDeleteUser}
                                className="bg-red-600 hover:bg-red-700 text-white text-xs h-7"
                              >
                                {drawerBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                                Yes, Delete Account
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={drawerBusy}
                                onClick={() => setShowDeleteConfirm(false)}
                                className="text-xs h-7"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Slide-over Audit Trail Drawer */}
      {auditDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Admin Audit Trail</h2>
                  <p className="text-xs text-slate-500">Immutable governance log of administrative actions</p>
                </div>
              </div>
              <button
                onClick={() => setAuditDrawerOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {auditLoading || !auditLogs ? (
                <div className="py-20 text-center text-sm text-slate-500 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
                  Loading audit logs…
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="py-20 text-center text-sm text-slate-400">
                  No administrative actions have been recorded yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {auditLogs.map((log) => {
                    const actionLabel =
                      log.action === 'update_plan'
                        ? 'Plan Changed'
                        : log.action === 'reset_quota'
                        ? 'Quota Reset'
                        : log.action === 'set_comp'
                        ? 'Comp Access Updated'
                        : log.action === 'grant_admin'
                        ? 'Admin Access Granted'
                        : log.action === 'revoke_admin'
                        ? 'Admin Access Revoked'
                        : log.action === 'set_status'
                        ? 'Account Status Changed'
                        : log.action === 'send_reset'
                        ? 'Password Reset Sent'
                        : log.action === 'delete_user'
                        ? 'Account Deleted'
                        : log.action;

                    const actionColor =
                      log.action === 'delete_user' || (log.action === 'set_status' && log.details?.disabled) || log.action === 'revoke_admin'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : log.action === 'grant_admin'
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : log.action === 'update_plan' || log.action === 'set_comp'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-700 border-slate-200';

                    return (
                      <div
                        key={log.id}
                        className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/40 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <Badge variant="outline" className={`font-semibold capitalize text-[11px] ${actionColor}`}>
                            {actionLabel}
                          </Badge>
                          <span className="text-slate-400 text-[11px]">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>

                        <div className="space-y-1 text-slate-600">
                          <div>
                            <span className="text-slate-400">Target User: </span>
                            <span className="font-mono text-slate-800">
                              {log.targetEmail || log.targetUid}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">Actor Admin: </span>
                            <span className="font-mono text-slate-800">{log.actorEmail || log.actorUid}</span>
                          </div>
                          {log.details && Object.keys(log.details).length > 0 && (
                            <div className="mt-1 pt-1.5 border-t border-slate-200/60 font-mono text-[11px] text-slate-700">
                              {JSON.stringify(log.details)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


