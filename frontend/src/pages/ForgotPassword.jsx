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
        <Link to="/" className="font-display text-3xl text-[#06402B] mb-12 block">Homesqre</Link>
        <h1 className="font-display text-4xl mb-3">Forgot password</h1>
        <p className="text-sm text-[#4A5D54] mb-8">Enter your email and we'll send a reset link.</p>
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
            <div className="font-display text-2xl mb-2 text-[#06402B]">Check your email</div>
            <p className="text-sm text-[#4A5D54]">
              If an account exists for {email}, you'll receive a reset link shortly.
            </p>
            {devToken && (
              <p className="text-xs text-[#B68D40] mt-4">
                Dev token: <code className="text-[10px]">{devToken}</code>
              </p>
            )}
          </div>
        )}
        <div className="mt-8 text-sm">
          <Link to="/login" className="text-[#06402B] hover:text-[#B68D40]">← Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
