import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("hs_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function formatApiError(err) {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Something went wrong";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .join(", ");
  if (detail?.msg) return detail.msg;
  return String(detail);
}

export function formatINR(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return "₹—";
  const n = Number(amount);
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2).replace(/\.00$/, "")} Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2).replace(/\.00$/, "")} Lakhs`;
  if (n >= 1_000) return `₹${n.toLocaleString("en-IN")}`;
  return `₹${n}`;
}

export function formatINRShort(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return "₹—";
  const n = Number(amount);
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2).replace(/\.00$/, "")}Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1).replace(/\.0$/, "")}L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

export default api;
