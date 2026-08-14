import React, { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import RequireAdmin from '../components/RequireAdmin';
import { listAdminTickets } from '../lib/adminClient';
import { Users, LifeBuoy, Sliders, Cpu, Sparkles } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/tickets', label: 'Tickets', icon: LifeBuoy, badgeKey: 'tickets' as const },
  { to: '/admin/flags', label: 'Feature Flags', icon: Sliders },
  { to: '/admin/models', label: 'Models', icon: Cpu },
  { to: '/admin/prompts', label: 'AI Prompts', icon: Sparkles },
];

/**
 * Consolidates the admin pages (Users/Tickets/Flags/Models/Prompts — 5 as of
 * admin-support-feedback-plan.md Phase 3) behind one sidebar shell instead of 5 flat
 * links in the Navbar's "More" dropdown. Single RequireAdmin gate here instead of one
 * per page — each admin page (AdminUsers.tsx etc.) no longer wraps itself.
 */
export default function AdminLayout() {
  const [newTicketCount, setNewTicketCount] = useState(0);

  useEffect(() => {
    const check = () => listAdminTickets({ status: 'new' }).then((t) => setNewTicketCount(t.length)).catch(() => {});
    check();
    const interval = setInterval(check, 120_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <RequireAdmin>
      <div className="flex min-h-[calc(100vh-4rem)] bg-slate-50">
        <aside className="w-56 shrink-0 border-r border-slate-200 bg-white">
          <div className="px-4 py-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Admin</h2>
          </div>
          <nav className="px-2 space-y-0.5">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                <span className="flex items-center gap-2.5">
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </span>
                {item.badgeKey === 'tickets' && newTicketCount > 0 && (
                  <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-brand-600 text-[10px] font-bold text-white">
                    {newTicketCount}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </aside>
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </RequireAdmin>
  );
}
