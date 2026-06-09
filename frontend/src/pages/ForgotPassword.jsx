import { useState } from "react";
import { Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      setSent(true);
      if (data.dev_token) setDevToken(data.dev_token);
      toast.success("Check your email for the reset link");
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full">
        <Link to="/" className="mb-12 block"><img src="/logo.svg" alt="Homesqre" className="h-24 md:h-32 w-auto object-contain" /></Link>
        <h1 className="font-display text-4xl mb-3">Forgot password</h1>
        <p className="text-sm text-[#333333] mb-8">Enter your email and we'll send a reset link.</p>
        {!sent ? (
          <form onSubmit={submit} className="space-y-6">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="hs-input"
              placeholder="you@example.com"
              data-testid="forgot-email"
            />
            <button className="btn-primary w-full justify-center" data-testid="forgot-submit">Send reset link</button>
          </form>
        ) : (
          <div className="bg-white border border-[#E8E4D9] p-6">
            <div className="font-display text-2xl mb-2 text-[#0C1D42]">Check your email</div>
            <p className="text-sm text-[#333333]">
              If an account exists for {email}, you'll receive a reset link shortly.
            </p>
            {devToken && (
              <p className="text-xs text-[#DA9E3E] mt-4">
                Dev token: <code className="text-[10px]">{devToken}</code>
              </p>
            )}
          </div>
        )}
        <div className="mt-8 text-sm">
          <Link to="/login" className="text-[#0C1D42] hover:text-[#DA9E3E]">← Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
