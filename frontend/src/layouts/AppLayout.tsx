import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth, type Role } from "../auth/AuthContext";
import { isClinicAdmin } from "../lib/roles";
import { get, post } from "../api/client";
import { Icons } from "../components/icons";
import { ClinicLogo } from "../branding/ClinicLogo";
import { SyncBanner } from "../offline/SyncBanner";
import { initials, ROLE_LABEL } from "../lib/labels";

type NavItem = {
  to: string;
  label: string;
  roles: Role[];
  icon: keyof typeof Icons;
};

const CARE: NavItem[] = [
  { to: "/", label: "Dashboard", roles: ["SUPER_ADMIN", "ADMIN"], icon: "dashboard" },
  { to: "/visits", label: "Queue", roles: ["SUPER_ADMIN", "ADMIN", "RECEPTION"], icon: "visits" },
  { to: "/patients", label: "Patients", roles: ["SUPER_ADMIN", "ADMIN", "RECEPTION", "DOCTOR", "CASHIER", "LAB", "PHARMACY"], icon: "patients" },
  { to: "/patients/new", label: "New patient", roles: ["SUPER_ADMIN", "ADMIN", "RECEPTION"], icon: "patients" },
  { to: "/consultation", label: "Queue", roles: ["SUPER_ADMIN", "ADMIN", "DOCTOR"], icon: "consultation" },
];

const OPERATIONS: NavItem[] = [
  { to: "/laboratory", label: "Laboratory", roles: ["SUPER_ADMIN", "ADMIN", "LAB", "DOCTOR", "RECEPTION"], icon: "lab" },
  { to: "/pharmacy", label: "Pharmacy", roles: ["SUPER_ADMIN", "ADMIN", "PHARMACY"], icon: "pharmacy" },
  { to: "/inventory", label: "Stock", roles: ["SUPER_ADMIN", "ADMIN", "PHARMACY"], icon: "reports" },
  { to: "/cashier", label: "Cashier", roles: ["SUPER_ADMIN", "ADMIN", "CASHIER", "RECEPTION"], icon: "cashier" },
];

const ADMIN: NavItem[] = [
  { to: "/admin/prices", label: "Price list", roles: ["SUPER_ADMIN", "ADMIN"], icon: "cash" },
  { to: "/reports", label: "Reports", roles: ["SUPER_ADMIN", "ADMIN"], icon: "reports" },
  { to: "/sms", label: "SMS", roles: ["SUPER_ADMIN", "ADMIN"], icon: "sms" },
  { to: "/admin/roles", label: "Rights & roles", roles: ["SUPER_ADMIN", "ADMIN"], icon: "admin" },
  { to: "/admin", label: "Administration", roles: ["SUPER_ADMIN", "ADMIN"], icon: "admin" },
];

function visible(items: NavItem[], role: Role) {
  return items.filter((n) => isClinicAdmin(role) || n.roles.includes(role));
}

function pageTitle(pathname: string) {
  if (pathname.startsWith("/patients/new")) return "Register patient";
  if (pathname.endsWith("/edit")) return "Edit patient";
  if (pathname.startsWith("/patients/")) return "Patient";
  if (pathname.startsWith("/admin/roles")) return "Rights & roles";
  if (pathname.startsWith("/admin/prices")) return "Price list";
  if (pathname.startsWith("/inventory")) return "Stock & inventory";
  if (pathname.startsWith("/consultation")) return "Consultation";
  if (pathname.startsWith("/cashier/receipts")) return "Receipt";
  const map: Record<string, string> = {
    "/": "Dashboard",
    "/patients": "Patients",
    "/visits": "Visits",
    "/laboratory": "Laboratory",
    "/pharmacy": "Pharmacy",
    "/inventory": "Stock & inventory",
    "/cashier": "Cashier",
    "/reports": "Reports",
    "/sms": "SMS",
    "/admin": "Administration",
    "/admin/roles": "Rights & roles",
    "/admin/prices": "Price list",
  };
  return map[pathname] || "ClinicFlow";
}

function InboxBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Array<{ id: string; title: string; body: string; href: string | null; readAt: string | null }>>([]);

  async function load() {
    try {
      setItems(await get("/notifications"));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(id);
  }, []);

  const unread = items.filter((i) => !i.readAt).length;

  return (
    <div className="relative mb-3 flex justify-end">
      <button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm" onClick={() => setOpen((v) => !v)}>
        Inbox{unread ? ` (${unread})` : ""}
      </button>
      {open ? (
        <div className="absolute right-0 top-10 z-30 w-80 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          {items.length === 0 ? <p className="p-2 text-sm text-slate-500">No notifications.</p> : null}
          {items.slice(0, 12).map((n) => (
            <button
              key={n.id}
              type="button"
              className={`block w-full rounded px-2 py-2 text-left text-sm ${n.readAt ? "text-slate-500" : "bg-sky-50 text-slate-900"}`}
              onClick={async () => {
                await post(`/notifications/${n.id}/read`, {});
                setOpen(false);
                if (n.href) navigate(n.href);
                await load();
              }}
            >
              <div className="font-medium">{n.title}</div>
              <div className="text-xs">{n.body}</div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SidebarNav({
  role,
  onNavigate,
}: {
  role: Role;
  onNavigate?: () => void;
}) {
  const groups = [
    { label: "Care", items: visible(CARE, role) },
    { label: "Operations", items: visible(OPERATIONS, role) },
    { label: "Clinic", items: visible(ADMIN, role) },
  ].filter((g) => g.items.length);

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-blue-100/70">
            {group.label}
          </div>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = Icons[item.icon];
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${
                      isActive
                        ? "bg-white/15 font-medium text-white"
                        : "text-blue-50/85 hover:bg-white/10 hover:text-white"
                    }`
                  }
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-90" />
                  {item.label}
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function AppLayout() {
  const { user, tenant, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const role = user!.role;

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const sidebar = (
    <div className="flex h-full flex-col bg-[var(--brand-dark)] text-white">
      <div className="border-b border-white/10 px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-white p-1">
            <ClinicLogo size={36} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-tight">{tenant?.name || "Clinic"}</div>
            <div className="text-[11px] text-blue-100/70">ClinicFlow</div>
          </div>
        </div>
      </div>
      <SidebarNav role={role} onNavigate={() => setOpen(false)} />
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg bg-white/10 px-2.5 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-semibold">
            {initials(user?.firstName, user?.lastName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">
              {user?.firstName} {user?.lastName}
            </div>
            <div className="truncate text-xs text-blue-100/70">{ROLE_LABEL[role]}</div>
          </div>
          <button
            type="button"
            onClick={logout}
            title="Sign out"
            className="rounded-md p-1.5 text-blue-100/80 hover:bg-white/10 hover:text-white"
          >
            <Icons.logout />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 md:block">{sidebar}</aside>

      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} aria-label="Close menu" />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-xl">{sidebar}</aside>
        </div>
      ) : null}

      <div className="md:pl-60">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200/80 bg-slate-100/90 px-4 py-3 backdrop-blur md:hidden">
          <button type="button" onClick={() => setOpen(true)} className="rounded-md p-1.5 text-slate-700 hover:bg-white" aria-label="Open menu">
            <Icons.menu className="h-5 w-5" />
          </button>
          <div>
            <div className="text-sm font-semibold text-slate-900">{pageTitle(location.pathname)}</div>
            <div className="text-xs text-slate-500">{tenant?.name}</div>
          </div>
        </div>
        <main className="mx-auto max-w-6xl p-4 md:p-8">
          <InboxBell />
          <SyncBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
