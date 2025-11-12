import { Navigate, Route, Routes } from "react-router-dom";

import AppShell from "@/layouts/AppShell";
import LoginPage from "@/pages/Auth/Login";
import Dashboard from "@/pages/Dashboard";
import MembersList from "@/pages/Members/List";
import CreateMember from "@/pages/Members/Create";
import EditMember from "@/pages/Members/Edit";
import PaymentsLedger from "@/pages/Payments/Ledger";
import MemberPaymentTimeline from "@/pages/Payments/MemberTimeline";
import SponsorshipWorkspace from "@/pages/Sponsorships";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/members" element={<MembersList />} />
        <Route path="/members/new" element={<CreateMember />} />
        <Route path="/members/:id/edit" element={<EditMember />} />
        <Route path="/payments" element={<PaymentsLedger />} />
        <Route path="/payments/members/:memberId" element={<MemberPaymentTimeline />} />
        <Route path="/sponsorships" element={<SponsorshipWorkspace />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
