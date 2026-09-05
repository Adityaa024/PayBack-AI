import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ShieldCheck, ArrowLeft, AlertCircle, Sparkles } from "lucide-react";
import recoveriqLogo from "../assets/recoveriq_svg.svg";
import { authService } from "../services/auth";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/Button";
import { getErrorMessage } from "../utils/error-utils";

type LoginStep = "credentials" | "mfa";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: boolean; password?: boolean; mfaCode?: boolean }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<LoginStep>("credentials");

  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const from = location.state?.from?.pathname || "/";

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    setIsLoading(true);

    try {
      const response = await authService.login({ email, password });

      if ('token' in response) {
        login(response.token, response.user);
        navigate(from, { replace: true });
      } else {
        setStep("mfa");
      }
    } catch (err) {
      setError(getErrorMessage(err));
      setFieldErrors({ email: true, password: true });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    setIsLoading(true);

    try {
      const response = await authService.mfaVerify(mfaCode.trim());
      login(response.token, response.user);
      navigate(from, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
      setFieldErrors({ mfaCode: true });
      const msg = getErrorMessage(err).toLowerCase();
      if (msg.includes("session") || msg.includes("expired")) {
        setStep("credentials");
        setMfaCode("");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToCredentials = () => {
    setStep("credentials");
    setMfaCode("");
    setError("");
    setFieldErrors({});
    sessionStorage.removeItem("mfa_pending_token");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-gray-100 to-blue-50 text-slate-900 p-4 font-sans">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-xl shadow-slate-200/70 overflow-hidden transition-all duration-300">
        
        {/* Header Section */}
        <div className="px-8 pt-8 pb-6 text-center border-b border-slate-100 bg-slate-50/50">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white border border-slate-200 shadow-md shadow-slate-100 mb-4">
            {step === "mfa" ? (
              <ShieldCheck className="h-7 w-7 text-indigo-600" />
            ) : (
              <img src={recoveriqLogo} alt="PayBack-AI Logo" className="h-8 w-8 object-contain" />
            )}
          </div>
          <div>
            {step === "credentials" ? (
              <>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>
                <p className="text-xs text-slate-500 font-medium mt-1">Sign in to your PayBack-AI account</p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Two-factor authentication</h1>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  {useBackupCode
                    ? "Enter one of your backup codes"
                    : "Enter the 6-digit code from your authenticator app"}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Form Body */}
        <div className="p-8">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start mb-5">
              <AlertCircle className="w-4 h-4 text-red-600 mr-2.5 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 font-medium">{error}</p>
            </div>
          )}

          {step === "credentials" && (
            <form onSubmit={handleCredentialsSubmit} className="space-y-5">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Email address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors(prev => ({ ...prev, email: false }));
                    }}
                    placeholder="you@company.com"
                    disabled={isLoading}
                    className={`w-full px-3.5 py-2.5 bg-slate-50 border ${
                      fieldErrors.email ? "border-red-400 focus:ring-red-200" : "border-slate-200 focus:border-indigo-600 focus:ring-indigo-100"
                    } rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 transition-all disabled:opacity-60`}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Password
                    </label>
                    <Link
                      to="/forgot-password"
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) setFieldErrors(prev => ({ ...prev, password: false }));
                    }}
                    placeholder="••••••••"
                    disabled={isLoading}
                    className={`w-full px-3.5 py-2.5 bg-slate-50 border ${
                      fieldErrors.password ? "border-red-400 focus:ring-red-200" : "border-slate-200 focus:border-indigo-600 focus:ring-indigo-100"
                    } rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 transition-all disabled:opacity-60`}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl py-3 text-xs shadow-md shadow-slate-900/10 transition-all"
                size="lg"
                isLoading={isLoading}
              >
                Sign in
              </Button>

              {/* 1-Click Judge Demo Light-Theme Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    login(
                      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkZW1vX2FkbWluIiwidGVuYW50SWQiOiJ0ZW5hbnRfZGVtb18wMDEiLCJyb2xlIjoiYWRtaW4iLCJleHAiOjk5OTk5OTk5OTl9.demo",
                      {
                        id: "demo_admin",
                        tenantId: "tenant_demo_001",
                        name: "Razorpay Judge / Demo",
                        email: "judge@razorpay.com",
                        role: "admin",
                        mfaEnabled: false,
                        created_at: new Date().toISOString(),
                      }
                    );
                    navigate("/recovery");
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 hover:from-blue-100 hover:to-purple-100 border border-indigo-200/80 text-indigo-700 font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer hover:shadow-md"
                >
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  1-Click Judge Demo (Control Tower)
                </button>
              </div>

              <p className="text-center text-xs text-slate-500 font-medium pt-2">
                Don't have an account?{" "}
                <Link to="/register" className="font-semibold text-slate-900 hover:text-indigo-600 hover:underline transition-colors">
                  Sign up
                </Link>
              </p>
            </form>
          )}

          {step === "mfa" && (
            <form onSubmit={handleMfaSubmit} className="space-y-5">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {useBackupCode ? "Backup code" : "Authenticator code"}
                  </label>
                  <input
                    type="text"
                    inputMode={useBackupCode ? "text" : "numeric"}
                    required
                    value={mfaCode}
                    onChange={(e) => {
                      setMfaCode(e.target.value);
                      if (fieldErrors.mfaCode) setFieldErrors(prev => ({ ...prev, mfaCode: false }));
                    }}
                    placeholder={useBackupCode ? "XXXXXXXXXX" : "000000"}
                    maxLength={useBackupCode ? 10 : 6}
                    disabled={isLoading}
                    autoFocus
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-center tracking-widest text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl py-3 text-xs shadow-md shadow-slate-900/10 transition-all"
                size="lg"
                isLoading={isLoading}
              >
                Verify
              </Button>

              <div className="space-y-2 text-center pt-2">
                <button
                  type="button"
                  className="text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                  onClick={() => {
                    setUseBackupCode((v) => !v);
                    setMfaCode("");
                    setError("");
                    setFieldErrors({});
                  }}
                >
                  {useBackupCode ? "Use authenticator app instead" : "Use a backup code instead"}
                </button>
                <div>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 mx-auto transition-colors cursor-pointer"
                    onClick={handleBackToCredentials}
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Back to login
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
