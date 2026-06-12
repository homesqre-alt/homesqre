import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from "sonner";
import "@/App.css";

import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import Home from "@/pages/Home";
import Interiors from "@/pages/Interiors";
import EmiCalculatorPage from "@/pages/EmiCalculatorPage";
import ProfileComplete from "@/pages/ProfileComplete";
import ThankYou from "@/pages/ThankYou";

import AdminDashboard from "@/pages/dashboards/AdminDashboard";
import CustomerDashboard from "@/pages/dashboards/CustomerDashboard";
import SalesDashboard from "@/pages/dashboards/SalesDashboard";
import DesignerDashboard from "@/pages/dashboards/DesignerDashboard";
import AuthCallback from "@/components/layout/AuthCallback";
import AdminLogin from "@/pages/AdminLogin";
import CustomerProfile from "@/pages/dashboards/CustomerProfile";

function AppRouter() {
  // Detect session_id during render (sync) — handles OAuth race condition
  const location = useLocation();
  const hash = location.hash || (typeof window !== "undefined" ? window.location.hash : "");
  if (hash && hash.includes("session_id=")) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      {/* HOMEPAGE - 100% INTERIORS FOCUSED */}
      <Route path="/" element={<Home />} />
      <Route path="/interiors" element={<Interiors />} />

      {/* CORE AUTHENTICATION */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/profile/complete" element={<ProfileComplete />} />
      <Route path="/emi-calculator" element={<EmiCalculatorPage />} />
      <Route path="/thank-you" element={<ThankYou />} />

      {/* Admin Console (quick add) */}
      <Route path="/admin/login" element={<AdminLogin />} />

      {/* Admin Dashboard — uses hash-based tab navigation internally (#overview, #pipeline, etc.) */}
      <Route path="/dashboard/admin" element={<AdminDashboard />} />

      {/* Customer Dashboard */}
      <Route path="/dashboard/customer" element={<CustomerDashboard />} />
      <Route path="/dashboard/profile" element={<CustomerProfile />} />

      {/* Staff Dashboards (role-gated inside each component) */}
      <Route path="/dashboard/sales" element={<SalesDashboard />} />
      <Route path="/dashboard/designer" element={<DesignerDashboard />} />

      {/* 404 catch-all — redirect unknown URLs to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRouter />
        <Toaster position="top-right" richColors theme="light" />
      </BrowserRouter>
    </AuthProvider>
  );
}
