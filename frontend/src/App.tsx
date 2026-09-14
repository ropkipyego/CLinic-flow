import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth, type Role } from "./auth/AuthContext";
import { AppLayout } from "./layouts/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { DashboardPage } from "./pages/DashboardPage";
import { PatientsPage } from "./pages/patients/PatientsPage";
import { PatientFormPage } from "./pages/patients/PatientFormPage";
import { PatientProfilePage } from "./pages/patients/PatientProfilePage";
import { VisitsPage } from "./pages/visits/VisitsPage";
import { ConsultationPage } from "./pages/consultation/ConsultationPage";
import { LabPage } from "./pages/lab/LabPage";
import { PharmacyPage } from "./pages/pharmacy/PharmacyPage";
import { CashierPage } from "./pages/cashier/CashierPage";
import { ReceiptPage } from "./pages/cashier/ReceiptPage";
import { ReportsPage } from "./pages/reports/ReportsPage";
import { SmsPage } from "./pages/sms/SmsPage";
import { AdminPage } from "./pages/admin/AdminPage";

function Guard({ roles, children }: { roles?: Role[]; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-sm text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && user.role !== "ADMIN" && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-sm text-slate-500">Loading ClinicFlow…</div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        element={
          <Guard>
            <AppLayout />
          </Guard>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/patients" element={<Guard roles={["RECEPTION", "DOCTOR", "CASHIER"]}><PatientsPage /></Guard>} />
        <Route path="/patients/new" element={<Guard roles={["RECEPTION"]}><PatientFormPage /></Guard>} />
        <Route path="/patients/:id" element={<PatientProfilePage />} />
        <Route path="/visits" element={<Guard roles={["RECEPTION", "DOCTOR"]}><VisitsPage /></Guard>} />
        <Route path="/consultation" element={<Guard roles={["DOCTOR"]}><ConsultationPage /></Guard>} />
        <Route path="/consultation/:encounterId" element={<Guard roles={["DOCTOR"]}><ConsultationPage /></Guard>} />
        <Route path="/laboratory" element={<Guard roles={["LAB", "DOCTOR", "RECEPTION"]}><LabPage /></Guard>} />
        <Route path="/pharmacy" element={<Guard roles={["PHARMACY"]}><PharmacyPage /></Guard>} />
        <Route path="/cashier" element={<Guard roles={["CASHIER"]}><CashierPage /></Guard>} />
        <Route path="/cashier/receipts/:id" element={<Guard roles={["CASHIER"]}><ReceiptPage /></Guard>} />
        <Route path="/reports" element={<Guard roles={[]}><ReportsPage /></Guard>} />
        <Route path="/sms" element={<Guard roles={[]}><SmsPage /></Guard>} />
        <Route path="/admin" element={<Guard roles={[]}><AdminPage /></Guard>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
