import { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

const ROLES = [
  { value: "customer", label: "I'm looking for a home" },
  { value: "agent", label: "I'm an agent" },
  { value: "builder", label: "I'm a builder" },
];

export default function ProfileComplete() {
  const { user, setUserData } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", mobile: "", role: "customer" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      setForm((f) => ({
        name: user.name || f.name,
        mobile: user.mobile || f.mobile,
        role: user.role || f.role,
      }));
    }
  }, [user]);

  if (user === undefined) return null;
  if (user === null) return <Navigate to="/login" />;
  if (user.profile_completed) {
    const dash =
      user.role === "admin" ? "/dashboard/admin"
      : user.role === "agent" ? "/dashboard/agent"
      : user.role === "builder" ? "/dashboard/builder"
      : "/dashboard/customer";
    return <Navigate to={dash} replace />;
  }

  const save = async (e) => {
    e.preventDefault();
    if (!form.mobile || form.mobile.length < 10) {
      toast.error("Please enter a valid mobile number");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.put("/me/profile", form);
      setUserData(data);
      toast.success("Profile complete! Welcome.");
      const dash =
        data.role === "agent" ? "/dashboard/agent"
        : data.role === "builder" ? "/dashboard/builder"
        : "/dashboard/customer";
      nav(dash);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      <div className="hidden lg:block relative">
        <img
          src="https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1400&q=80"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/20" />
        <div className="absolute bottom-12 left-12 right-12 text-white">
          <div className="label-eyebrow text-[#B68D40] mb-4">Almost there</div>
          <h2 className="font-display text-5xl leading-tight">
            One last step.
          </h2>
        </div>
      </div>

      <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-24 py-12">
        <div className="font-display text-3xl text-[#06402B] mb-12">Homesqre</div>
        <h1 className="font-display text-4xl mb-3">Complete your profile</h1>
        <p className="text-sm text-[#4A5D54] mb-10">
          Just a couple of details so we can personalise your experience.
        </p>

        <form onSubmit={save} className="space-y-6 max-w-md" data-testid="profile-form">
          <div>
            <label className="label-eyebrow mb-2 block">I am</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setForm({ ...form, role: r.value })}
                  className={`text-xs p-3 border tracking-wide ${
                    form.role === r.value
                      ? "border-[#06402B] bg-[#06402B] text-[#FAF9F6]"
                      : "border-[#E8E4D9] text-[#1A2421]"
                  }`}
                  data-testid={`profile-role-${r.value}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label-eyebrow mb-2 block">Full name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="hs-input"
              data-testid="profile-name"
            />
          </div>
          <div>
            <label className="label-eyebrow mb-2 block">Mobile</label>
            <input
              required
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              className="hs-input"
              placeholder="+91 9999900000"
              data-testid="profile-mobile"
            />
          </div>
          <button disabled={busy} className="btn-primary w-full justify-center" data-testid="profile-submit">
            {busy ? "Saving…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
