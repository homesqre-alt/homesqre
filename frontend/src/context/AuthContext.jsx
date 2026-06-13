import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = guest

  const refresh = useCallback(async () => {
    // 🛑 Emergent AI session_id logic removed completely.
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    setUser(data.user);
    return data.user;
  };

  // 🚀 NEW: Custom Google Login Handler
  const googleLogin = async (googleToken) => {
    // Takes the secure token from Google and hands it directly to your Python backend
    const { data } = await api.post("/auth/google", { token: googleToken });
    setUser(data.user);
    return data.user;
  };

  const loginOtpVerify = async (mobile, otp) => {
    const { data } = await api.post("/auth/login-otp-verify", { mobile, otp });
    setUser(data.user);
    return data.user;
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    setUser(data.user);
    return data;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (e) {
      console.warn("Logout API call failed (clearing local state anyway):", e?.message || e);
    }
    setUser(null);
  };

  const setUserData = (u) => setUser(u);

  return (
    <AuthContext.Provider value={{ user, login, loginOtpVerify, googleLogin, register, logout, refresh, setUserData }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
