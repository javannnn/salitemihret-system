import { useState, useEffect, useCallback } from "react";
import { login } from "@/lib/auth";
import { Input } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useTheme } from "@/context/ThemeContext";
import { motion, AnimatePresence } from "framer-motion";
import { User, ArrowRight, Loader2, ShieldCheck, Lock, Moon, Sun, Eye, EyeOff } from "lucide-react";

const DEMO_ACCOUNTS = [
  { label: "Super Admin", email: "superadmin@example.com", password: "Demo123!", role: "Administrator" },
  { label: "PR Admin", email: "pradmin@example.com", password: "Demo123!", role: "Public Relations" },
  { label: "Registrar", email: "registrar@example.com", password: "Demo123!", role: "Academic" },
  { label: "Clerk", email: "clerk@example.com", password: "Demo123!", role: "Administrative" },
  { label: "Finance Admin", email: "finance@example.com", password: "Demo123!", role: "Financial" },
];

export default function LoginPage() {
  const [email, setEmail] = useState(DEMO_ACCOUNTS[0].email);
  const [password, setPassword] = useState(DEMO_ACCOUNTS[0].password);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recaptchaReady, setRecaptchaReady] = useState(false);
  const [recaptchaError, setRecaptchaError] = useState("");
  const toast = useToast();
  const { theme, toggleTheme } = useTheme();
  const siteKey = (import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined) || "";

  const loadRecaptcha = useCallback(() => {
    if (!siteKey) {
      setRecaptchaReady(false);
      return;
    }
    if (typeof window === "undefined") return;
    if ((window as any).grecaptcha) {
      setRecaptchaReady(true);
      return;
    }
    if (document.getElementById("recaptcha-script")) return;
    const script = document.createElement("script");
    script.id = "recaptcha-script";
    script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
    script.async = true;
    script.onload = () => setRecaptchaReady(true);
    script.onerror = () => setRecaptchaError("reCAPTCHA failed to load. Check your network.");
    document.body.appendChild(script);
  }, [siteKey]);

  useEffect(() => {
    loadRecaptcha();
  }, [loadRecaptcha]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setRecaptchaError("");
    let token: string | undefined;
    if (siteKey) {
      if (!recaptchaReady || !(window as any).grecaptcha) {
        setError("reCAPTCHA is not ready. Please wait and try again.");
        setLoading(false);
        return;
      }
      try {
        token = await (window as any).grecaptcha.execute(siteKey, { action: "login" });
      } catch (err) {
        console.error(err);
        setError("Unable to verify reCAPTCHA. Please retry.");
        setLoading(false);
        return;
      }
    }
    try {
      await login(email, password, token);
      toast.push("Logged in successfully");
      window.location.href = "/dashboard";
    } catch (err) {
      console.error(err);
      setError("Login failed. Check the credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#F5F5F7] dark:bg-[#050505] p-4 relative overflow-hidden font-sans selection:bg-gray-500/30 transition-colors duration-500">
      {/* Abstract Background Elements - Monochrome */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-gray-300/20 rounded-full blur-[120px] mix-blend-multiply animate-pulse dark:bg-gray-800/20" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-gray-400/20 rounded-full blur-[120px] mix-blend-multiply animate-pulse delay-1000 dark:bg-gray-700/20" />

      {/* Theme Toggle */}
      <motion.button
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        onClick={toggleTheme}
        className="absolute top-6 right-6 p-3 rounded-full bg-white/50 dark:bg-black/50 backdrop-blur-md border border-gray-200 dark:border-gray-800 shadow-sm hover:scale-110 transition-transform z-50 group"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={theme}
            initial={{ y: -20, opacity: 0, rotate: -90 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            exit={{ y: 20, opacity: 0, rotate: 90 }}
            transition={{ duration: 0.2 }}
          >
            {theme === "dark" ? (
              <Moon size={20} className="text-white fill-white" />
            ) : (
              <Sun size={20} className="text-black fill-black" />
            )}
          </motion.div>
        </AnimatePresence>
      </motion.button>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-5xl bg-white/80 dark:bg-[#0A0A0A]/80 backdrop-blur-2xl border border-white/20 dark:border-white/5 shadow-2xl rounded-[32px] overflow-hidden grid md:grid-cols-5 relative z-10"
      >
        {/* Left Side: Demo Accounts */}
        <div className="md:col-span-3 p-8 md:p-12 bg-gray-50/50 dark:bg-white/[0.02] border-r border-gray-100/50 dark:border-white/5 flex flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-8"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 bg-black dark:bg-white rounded-lg grid place-items-center text-white dark:text-black">
                <ShieldCheck size={18} strokeWidth={2.5} />
              </div>
              <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">SaliteOne</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">
              Welcome back
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-lg">
              Choose a demo profile to explore the system instantly.
            </p>
          </motion.div>

          <div className="grid gap-3">
            {DEMO_ACCOUNTS.map((account, index) => (
              <motion.button
                key={account.email}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + index * 0.1 }}
                onClick={() => {
                  setEmail(account.email);
                  setPassword(account.password);
                }}
                className={`group relative flex items-center gap-4 p-4 rounded-2xl text-left transition-all duration-300 border ${email === account.email
                  ? "bg-white dark:bg-white/10 border-gray-300 dark:border-white/20 shadow-lg shadow-black/5 scale-[1.02]"
                  : "bg-white/40 dark:bg-white/5 border-transparent hover:bg-white/80 dark:hover:bg-white/10 hover:scale-[1.01]"
                  }`}
              >
                <div className={`h-12 w-12 rounded-full grid place-items-center text-lg font-semibold transition-colors ${email === account.email
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400 group-hover:bg-gray-200 group-hover:text-gray-900 dark:group-hover:bg-white/20 dark:group-hover:text-white"
                  }`}>
                  {account.label.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={`font-semibold truncate ${email === account.email ? "text-gray-900 dark:text-white" : "text-gray-700 dark:text-gray-200"}`}>
                      {account.label}
                    </p>
                    {email === account.email && (
                      <motion.div layoutId="active-indicator" className="h-2 w-2 bg-black dark:bg-white rounded-full" />
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{account.role}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Right Side: Login Form */}
        <div className="md:col-span-2 p-8 md:p-12 bg-white/40 dark:bg-black/20 flex flex-col justify-center relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="w-full max-w-sm mx-auto"
          >
            <div className="mb-8 text-center md:text-left">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">Sign in manually</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Enter your credentials to access your account</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 ml-1">Email</label>
                <div className="relative group">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-black dark:group-focus-within:text-white transition-colors" size={18} />
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    required
                    className="pl-10 h-12 bg-white/50 dark:bg-black/20 border-gray-200 dark:border-white/10 focus:border-black dark:focus:border-white focus:ring-4 focus:ring-black/5 dark:focus:ring-white/5 rounded-xl transition-all"
                    placeholder="name@example.com"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 ml-1">Password</label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-black dark:group-focus-within:text-white transition-colors" size={18} />
                  <Input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPassword ? "text" : "password"}
                    required
                    className="pl-10 pr-10 h-12 bg-white/50 dark:bg-black/20 border-gray-200 dark:border-white/10 focus:border-black dark:focus:border-white focus:ring-4 focus:ring-black/5 dark:focus:ring-white/5 rounded-xl transition-all"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors focus:outline-none"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg flex items-center gap-2"
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
                    {error}
                  </motion.div>
                )}
                {!error && recaptchaError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg flex items-center gap-2"
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {recaptchaError}
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading || (siteKey ? !recaptchaReady : false)}
                className="w-full h-12 bg-black hover:bg-gray-900 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-black font-medium rounded-xl shadow-lg shadow-black/10 dark:shadow-white/5 flex items-center justify-center gap-2 transition-all disabled:opacity-70 disabled:cursor-not-allowed mt-2"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    Sign In <ArrowRight size={18} />
                  </>
                )}
              </motion.button>
              <p className="text-[11px] text-center text-gray-500 dark:text-gray-400">
                {siteKey ? "Protected by Google reCAPTCHA v3" : "reCAPTCHA not configured (contact admin)."}
              </p>
            </form>

            <div className="mt-8 text-center">
              <p className="text-xs text-gray-400">
                Protected by reCAPTCHA and subject to the Privacy Policy and Terms of Service.
              </p>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
