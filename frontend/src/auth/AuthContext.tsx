import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { get, post } from "../api/client";

export type Role = "ADMIN" | "RECEPTION" | "DOCTOR" | "LAB" | "PHARMACY" | "CASHIER";

export type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
};

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  receiptFooter: string | null;
  timezone: string;
  currency: string;
};

type AuthState = {
  user: User | null;
  tenant: Tenant | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

function applyTheme(tenant?: Tenant | null) {
  if (!tenant) return;
  document.documentElement.style.setProperty("--brand", tenant.primaryColor);
  document.documentElement.style.setProperty("--brand-accent", tenant.secondaryColor);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("clinicflow_token");
    if (!token) {
      setLoading(false);
      return;
    }
    get<{ user: User; tenant: Tenant }>("/auth/me")
      .then((data) => {
        setUser(data.user);
        setTenant(data.tenant);
        applyTheme(data.tenant);
      })
      .catch(() => {
        localStorage.removeItem("clinicflow_token");
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      tenant,
      loading,
      login: async (email, password) => {
        const data = await post<{ token: string; user: User; tenant: Tenant }>("/auth/login", { email, password });
        localStorage.setItem("clinicflow_token", data.token);
        setUser(data.user);
        setTenant(data.tenant);
        applyTheme(data.tenant);
      },
      logout: () => {
        localStorage.removeItem("clinicflow_token");
        setUser(null);
        setTenant(null);
      },
    }),
    [user, tenant, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function canSee(role: Role, allowed: Role[]) {
  return role === "ADMIN" || allowed.includes(role);
}
