import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from "sonner";
import "@/App.css";

import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import Interiors from "@/pages/Interiors";
import EmiCalculatorPage from "@/pages/EmiCalculatorPage";
import ProfileComplete from "@/pages/ProfileComplete";

import AdminDashboard from "@/pages/dashboards/AdminDashboard";
import CustomerDashboard from "@/pages/dashboards/CustomerDashboard";
import AuthCallback from "@/components/layout/AuthCallback";
import AdminLogin from "@/pages/AdminLogin";

function AppRouter() {
  // Detect session_id during render (sync) — handles OAuth race condition
  const location = useLocation();
  const hash = location.hash || (typeof window !== "undefined" ? window.location.hash : "");
  if (hash && hash.includes("session_id=")) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      {/* 🚀 REDIRECT: Instantly forwards homesqre.com to homesqre.com/interiors */}
      <Route path="/" element={<Navigate to="/interiors" replace />} />
      <Route path="/interiors" element={<Interiors />} />

      {/* CORE AUTHENTICATION */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/profile/complete" element={<ProfileComplete />} />
      <Route path="/emi-calculator" element={<EmiCalculatorPage />} />

      {/* Admin Console (quick add) */}
      <Route path="/admin/login" element={<AdminLogin />} />

      {/* Admin Dashboard */}
      <Route path="/dashboard/admin" element={<AdminDashboard tab="overview" />} />
      <Route path="/dashboard/admin/users" element={<AdminDashboard tab="users" />} />
      <Route path="/dashboard/admin/listings" element={<AdminDashboard tab="listings" />} />
      <Route path="/dashboard/admin/projects" element={<AdminDashboard tab="projects" />} />
      <Route path="/dashboard/admin/inquiries" element={<AdminDashboard tab="inquiries" />} />
      <Route path="/dashboard/admin/interior-leads" element={<AdminDashboard tab="interior-leads" />} />
      <Route path="/dashboard/admin/loan-leads" element={<AdminDashboard tab="loan-leads" />} />
      <Route path="/dashboard/admin/banks" element={<AdminDashboard tab="banks" />} />
      <Route path="/dashboard/admin/amenities" element={<AdminDashboard tab="amenities" />} />
      <Route path="/dashboard/admin/cms/homepage" element={<AdminDashboard tab="cms-homepage" />} />
      <Route path="/dashboard/admin/cms/interiors" element={<AdminDashboard tab="cms-interiors" />} />

      {/* Customer Dashboard */}
      <Route path="/dashboard/customer" element={<CustomerDashboard />} />
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
