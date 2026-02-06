import { Navigate, Route, Routes } from "react-router-dom";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";

import AppShell from "@/layouts/AppShell";
import ProtectedRoute from "@/components/ProtectedRoute";

import SplashScreen from "@/components/SplashScreen";

// Lazy load pages
const LoginPage = lazy(() => import("@/pages/Auth/Login"));
const Onboard = lazy(() => import("@/pages/Auth/Onboard"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const MembersList = lazy(() => import("@/pages/Members/List"));
const CreateMember = lazy(() => import("@/pages/Members/Create"));
const EditMember = lazy(() => import("@/pages/Members/Edit"));
const PaymentsLedger = lazy(() => import("@/pages/Payments/Ledger"));
const MemberPaymentTimeline = lazy(() => import("@/pages/Payments/MemberTimeline"));
const NewcomersWorkspace = lazy(() => import("@/pages/Newcomers"));
const NewcomerProfile = lazy(() => import("@/pages/Newcomers/Profile"));
const SponsorshipWorkspace = lazy(() => import("@/pages/Sponsorships"));
const SponsorshipCaseProfile = lazy(() => import("@/pages/Sponsorships/CaseProfile"));
const SchoolsWorkspace = lazy(() => import("@/pages/Schools"));
const VolunteersWorkspace = lazy(() => import("@/pages/Volunteers"));
const UsersList = lazy(() => import("@/pages/Admin/Users/List"));
const UserDetail = lazy(() => import("@/pages/Admin/Users/Detail"));
const EmailClient = lazy(() => import("@/pages/Admin/Email/Client"));
const ReportsClient = lazy(() => import("@/pages/Admin/Reports/Client"));
const AccountProfile = lazy(() => import("@/pages/Account/Profile"));

export default function App() {
  return (
    <Suspense fallback={<SplashScreen />}>
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
          <Route path="/newcomers" element={<NewcomersWorkspace />} />
          <Route path="/newcomers/:id" element={<NewcomerProfile />} />
          <Route path="/sponsorships" element={<SponsorshipWorkspace />} />
          <Route path="/sponsorships/:id" element={<SponsorshipCaseProfile />} />
          <Route path="/volunteers" element={<VolunteersWorkspace />} />
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
          <Route
            path="/admin/email"
            element={
              <ProtectedRoute requireSuperAdmin>
                <EmailClient />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/reports"
            element={
              <ProtectedRoute>
                <ReportsClient />
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
