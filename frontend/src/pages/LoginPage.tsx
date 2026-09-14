import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Alert, Button, Field, inputClass } from "../components/ui";
import { ApiRequestError } from "../api/client";
import { ClinicLogo } from "../branding/ClinicLogo";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Unable to sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden flex-col justify-between bg-[var(--brand-dark)] px-12 py-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-white p-1.5">
            <ClinicLogo size={56} />
          </div>
          <div className="text-sm font-semibold tracking-tight">ClinicFlow</div>
        </div>
        <div className="max-w-md">
          <p className="text-3xl font-semibold leading-tight">One patient. One visit. One bill.</p>
          <p className="mt-4 text-sm leading-6 text-blue-100/80">
            Reception registers, the doctor consults, lab and pharmacy work the same visit, and cashier collects what was actually done — including any extra hospital charge typed at the desk.
          </p>
        </div>
        <p className="text-xs text-blue-100/60">Outpatient clinic workflow</p>
      </div>
      <div className="flex items-center justify-center bg-slate-100 p-6">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="rounded-xl bg-white p-1 shadow-sm">
              <ClinicLogo size={48} />
            </div>
            <div>
              <div className="text-lg font-semibold text-[var(--brand)]">ClinicFlow</div>
              <p className="text-sm text-slate-500">Sign in to continue</p>
            </div>
          </div>
          <div className="hidden lg:block">
            <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
            <p className="mt-1 text-sm text-slate-500">Use the account issued by your clinic administrator.</p>
          </div>
          {error ? <Alert kind="error">{error}</Alert> : null}
          <Field label="Email">
            <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" required />
          </Field>
          <Field label="Password">
            <input className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          <Link className="block text-sm text-slate-500 hover:text-slate-800" to="/reset-password">
            Forgot password
          </Link>
        </form>
      </div>
    </div>
  );
}
