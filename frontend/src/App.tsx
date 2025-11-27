import { Navigate, Route, Routes } from "react-router-dom";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";

import AppShell from "@/layouts/AppShell";
import ProtectedRoute from "@/components/ProtectedRoute";

// Lazy load pages
const LoginPage = lazy(() => import("@/pages/Auth/Login"));
const Onboard = lazy(() => import("@/pages/Auth/Onboard"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const MembersList = lazy(() => import("@/pages/Members/List"));
const CreateMember = lazy(() => import("@/pages/Members/Create"));
const EditMember = lazy(() => import("@/pages/Members/Edit"));
const PaymentsLedger = lazy(() => import("@/pages/Payments/Ledger"));
const MemberPaymentTimeline = lazy(() => import("@/pages/Payments/MemberTimeline"));
const SponsorshipWorkspace = lazy(() => import("@/pages/Sponsorships"));
const SchoolsWorkspace = lazy(() => import("@/pages/Schools"));
const UsersList = lazy(() => import("@/pages/Admin/Users/List"));
const UserDetail = lazy(() => import("@/pages/Admin/Users/Detail"));
const AccountProfile = lazy(() => import("@/pages/Account/Profile"));

const PageLoader = () => (
  <div className="flex h-screen w-full items-center justify-center bg-bg">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/onboard" element={<Onboard />} />
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
          <Route path="/schools" element={<SchoolsWorkspace />} />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute requireSuperAdmin>
                <UsersList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users/:id"
            element={
              <ProtectedRoute requireSuperAdmin>
                <UserDetail />
              </ProtectedRoute>
            }
          />
          <Route path="/account" element={<AccountProfile />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
