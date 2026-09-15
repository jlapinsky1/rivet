import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Trash2, Mail, Lock, User, AlertTriangle, ArrowLeft } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { loadDraft, isSubmittableDraft } from "../utils/commercialRequestDraft";
import { trySubmitSavedDraft } from "../utils/submitCommercialDraft";

export default function ClientLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resumeRequest = searchParams.get("resume") === "request";
  const [mode, setMode] = useState("login"); // login | signup | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [contactName, setContactName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (resumeRequest && loadDraft()) {
      setMode("login");
    }
  }, [resumeRequest]);

  async function finishLoginRedirect() {
    if (supabase) {
      try {
        const submitted = await trySubmitSavedDraft(supabase);
        if (submitted) {
          navigate("/portal");
          return;
        }
      } catch (err) {
        setError(err?.message || "Logged in, but failed to submit your saved request.");
        navigate("/portal");
        return;
      }
    }
    navigate("/portal");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await finishLoginRedirect();
      } else if (mode === "forgot") {
        const res = await fetch("/.netlify/functions/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Something went wrong.");
        setResetSent(true);
      } else {
        // signup - handled server-side so Resend sends the confirmation email
        if (password.length < 8) {
          throw new Error("Password must be at least 8 characters.");
        }
        const res = await fetch("/.netlify/functions/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, contactName }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Something went wrong.");
        setSignupSuccess(true);
      }
    } catch (err) {
      let msg = err?.message || "Something went wrong.";
      // Make Supabase's generic error more actionable
      if (msg.toLowerCase().includes("already") && msg.toLowerCase().includes("exist")) {
        msg = "An account with this email already exists. Please log in instead, or use \"Forgot password\" to reset your credentials.";
      }
      if (msg === "Invalid login credentials") {
        msg = "Invalid email or password. If you haven't confirmed your email yet, check your inbox for a confirmation link.";
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // Success: signup confirmation sent
  if (signupSuccess) {
    return (
      <div className="min-h-screen bg-[#0a0f0d] flex items-center justify-center px-5">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="w-14 h-14 rounded-full bg-[#22c55e]/15 border border-[#22c55e]/30 flex items-center justify-center mx-auto">
            <Mail className="w-7 h-7 text-[#22c55e]" />
          </div>
          <h2 className="text-2xl font-black text-white">Check your email</h2>
          <p className="text-white/55 text-sm max-w-sm mx-auto">
            We sent a confirmation link to <strong className="text-white">{email}</strong>. Click the link to activate your account, then come back here to log in.
          </p>
          <button
            onClick={() => { setSignupSuccess(false); setMode("login"); }}
            className="text-sm text-[#22c55e] font-semibold hover:underline"
          >
            Back to log in
          </button>
        </div>
      </div>
    );
  }

  // Success: password reset email sent
  if (resetSent) {
    return (
      <div className="min-h-screen bg-[#0a0f0d] flex items-center justify-center px-5">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="w-14 h-14 rounded-full bg-[#22c55e]/15 border border-[#22c55e]/30 flex items-center justify-center mx-auto">
            <Mail className="w-7 h-7 text-[#22c55e]" />
          </div>
          <h2 className="text-2xl font-black text-white">Check your email</h2>
          <p className="text-white/55 text-sm max-w-sm mx-auto">
            If an account exists for <strong className="text-white">{email}</strong>, we sent a password reset link. Check your inbox and follow the instructions.
          </p>
          <button
            onClick={() => { setResetSent(false); setMode("login"); }}
            className="text-sm text-[#22c55e] font-semibold hover:underline"
          >
            Back to log in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f0d] flex items-center justify-center px-5">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <a href="/" className="inline-flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-[#0a0f0d]" />
            </div>
            <div className="leading-none text-left">
              <span className="text-white font-black tracking-widest text-sm uppercase">Squatterz</span>
              <div className="text-[#22c55e] text-[9px] tracking-[0.2em] font-semibold uppercase mt-0.5">Client Portal</div>
            </div>
          </a>
          <h1 className="text-3xl font-black text-white">
            {mode === "login" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password"}
          </h1>
          <p className="mt-2 text-sm text-white/45">
            {resumeRequest
              ? "Log in to submit your saved estimate request."
              : mode === "login"
              ? "Log in to view jobs, invoices, and documentation."
              : mode === "signup"
              ? "Sign up to access your commercial account portal."
              : "Enter your email and we'll send you a reset link."}
          </p>
        </div>

        {error && (
          <div className="bg-red-400/10 border border-red-400/20 rounded-xl p-4 text-sm text-red-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white/4 border border-white/8 rounded-2xl p-6 md:p-8 space-y-5">
          {mode === "signup" && (
            <label className="block space-y-2">
              <span className="block text-xs text-white/50 font-medium uppercase tracking-wider">Your name</span>
              <div className="flex items-center gap-3 bg-[#111a14] border border-white/10 rounded-xl px-4 py-3 focus-within:border-[#22c55e]/40 transition-colors">
                <User className="w-4 h-4 text-[#22c55e] shrink-0" />
                <input
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Jordan Rivera"
                  className="w-full bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
                />
              </div>
            </label>
          )}

          <label className="block space-y-2">
            <span className="block text-xs text-white/50 font-medium uppercase tracking-wider">Email</span>
            <div className="flex items-center gap-3 bg-[#111a14] border border-white/10 rounded-xl px-4 py-3 focus-within:border-[#22c55e]/40 transition-colors">
              <Mail className="w-4 h-4 text-[#22c55e] shrink-0" />
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jordan@managementco.com"
                autoComplete="email"
                className="w-full bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
              />
            </div>
          </label>

          {mode !== "forgot" && (
            <label className="block space-y-2">
              <span className="block text-xs text-white/50 font-medium uppercase tracking-wider">Password</span>
              <div className="flex items-center gap-3 bg-[#111a14] border border-white/10 rounded-xl px-4 py-3 focus-within:border-[#22c55e]/40 transition-colors">
                <Lock className="w-4 h-4 text-[#22c55e] shrink-0" />
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "Min. 8 characters" : "Your password"}
                  minLength={mode === "signup" ? 8 : undefined}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  className="w-full bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
                />
              </div>
            </label>
          )}

          {mode === "login" && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => { setMode("forgot"); setError(null); }}
                className="text-xs text-white/40 hover:text-[#22c55e] transition-colors"
              >
                Forgot password?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#22c55e] hover:bg-[#16a34a] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold text-base py-4 rounded-xl flex items-center justify-center gap-2 transition-all"
          >
            {loading
              ? (mode === "login" ? "Logging in..." : mode === "signup" ? "Creating account..." : "Sending link...")
              : (mode === "login" ? "Log In" : mode === "signup" ? "Create Account" : "Send Reset Link")}
          </button>
        </form>

        <p className="text-center text-sm text-white/45">
          {mode === "login" ? (
            <>
              New commercial customer?{" "}
              <a href="/portal/start" className="text-[#22c55e] font-semibold hover:underline">
                Request an estimate
              </a>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button onClick={() => { setMode("login"); setError(null); }} className="text-[#22c55e] font-semibold hover:underline">
                Log in
              </button>
            </>
          )}
        </p>

        <div className="text-center">
          <a href="/" className="inline-flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors">
            <ArrowLeft className="w-3 h-3" /> Back to Commercial
          </a>
        </div>
      </div>
    </div>
  );
}
