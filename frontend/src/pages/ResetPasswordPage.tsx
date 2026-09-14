import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { post } from "../api/client";
import { Alert, Button, Field, inputClass } from "../components/ui";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function requestReset(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await post("/auth/forgot-password", { email });
      setMessage("If that account exists, a reset link was queued. Email stays off in development unless it is explicitly enabled.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request a password reset.");
    }
  }

  async function doReset(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await post("/auth/reset-password", { token, password });
      setMessage("Password updated. You can now sign in.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset password.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <form onSubmit={token ? doReset : requestReset} className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <div>
          <div className="text-sm font-semibold text-[var(--brand)]">ClinicFlow</div>
          <h1 className="mt-2 text-xl font-semibold text-slate-900">Reset password</h1>
        </div>
        {error ? <Alert kind="error">{error}</Alert> : null}
        {message ? <Alert kind="success">{message}</Alert> : null}
        {token ? (
          <Field label="New password">
            <input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          </Field>
        ) : (
          <Field label="Email">
            <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
        )}
        <Button type="submit">{token ? "Update password" : "Send reset link"}</Button>
        <Link className="block text-sm text-slate-500 hover:text-slate-800" to="/login">
          Back to sign in
        </Link>
      </form>
    </div>
  );
}
