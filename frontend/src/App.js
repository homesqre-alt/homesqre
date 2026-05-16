import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from "sonner";
import "@/App.css";

import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import Properties from "@/pages/Properties";
import PropertyDetail from "@/pages/PropertyDetail";
import ProjectsList from "@/pages/ProjectsList";
import ProjectMicrosite from "@/pages/ProjectMicrosite";
import Interiors from "@/pages/Interiors";
import EmiCalculatorPage from "@/pages/EmiCalculatorPage";
import Compare from "@/pages/Compare";
import Favourites from "@/pages/Favourites";

import AdminDashboard from "@/pages/dashboards/AdminDashboard";
import AgentDashboard from "@/pages/dashboards/AgentDashboard";
import BuilderDashboard from "@/pages/dashboards/BuilderDashboard";
import CustomerDashboard from "@/pages/dashboards/CustomerDashboard";
import AuthCallback from "@/components/layout/AuthCallback";

function AppRouter() {
  // Detect session_id during render (sync) — handles OAuth race condition
  const location = useLocation();
  const hash = location.hash || (typeof window !== "undefined" ? window.location.hash : "");
  if (hash && hash.includes("session_id=")) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      <Route path="/properties" element={<Properties />} />
      <Route path="/properties/:id" element={<PropertyDetail />} />

      <Route path="/projects" element={<ProjectsList />} />
      <Route path="/projects/:city/:locality/:slug" element={<ProjectMicrosite />} />

      <Route path="/interiors" element={<Interiors />} />
      <Route path="/emi-calculator" element={<EmiCalculatorPage />} />
      <Route path="/compare" element={<Compare />} />
      <Route path="/favourites" element={<Favourites />} />

      {/* Admin */}
      <Route path="/dashboard/admin" element={<AdminDashboard tab="overview" />} />
      <Route path="/dashboard/admin/users" element={<AdminDashboard tab="users" />} />
      <Route path="/dashboard/admin/listings" element={<AdminDashboard tab="listings" />} />
      <Route path="/dashboard/admin/projects" element={<AdminDashboard tab="projects" />} />
      <Route path="/dashboard/admin/inquiries" element={<AdminDashboard tab="inquiries" />} />
      <Route path="/dashboard/admin/interior-leads" element={<AdminDashboard tab="interior-leads" />} />
      <Route path="/dashboard/admin/loan-leads" element={<AdminDashboard tab="loan-leads" />} />
      <Route path="/dashboard/admin/banks" element={<AdminDashboard tab="banks" />} />
      <Route path="/dashboard/admin/amenities" element={<AdminDashboard tab="amenities" />} />

      {/* Agent */}
      <Route path="/dashboard/agent" element={<AgentDashboard tab="listings" />} />
      <Route path="/dashboard/agent/leads" element={<AgentDashboard tab="leads" />} />
      <Route path="/dashboard/agent/subscription" element={<AgentDashboard tab="subscription" />} />

      {/* Builder */}
      <Route path="/dashboard/builder" element={<BuilderDashboard tab="projects" />} />
      <Route path="/dashboard/builder/inquiries" element={<BuilderDashboard tab="inquiries" />} />
      <Route path="/dashboard/builder/subscription" element={<BuilderDashboard tab="subscription" />} />

      {/* Customer */}
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
