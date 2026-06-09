import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

/**
 * Guards a route so only signed-in admins can reach it.
 * - While auth state is loading (undefined), renders a small placeholder.
 * - Unauthenticated → redirects to /admin/login, preserving intended URL.
 * - Authenticated non-admin → bounced to their own dashboard or home.
 */
export default function RequireAdmin({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center font-display text-2xl text-[#0C1D42]">
        Loading…
      </div>
    );
  }

  if (user === null) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  if (user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return children;
}
