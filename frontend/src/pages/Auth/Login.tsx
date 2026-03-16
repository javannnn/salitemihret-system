import { useState, useEffect, useCallback, useId } from "react";
import { Link } from "react-router-dom";
import { login, whoami } from "@/lib/auth";
import { Input } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useTheme } from "@/context/ThemeContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Moon,
  ShieldCheck,
  Sun,
  User,
} from "lucide-react";

function SaliteOneWordmarkReveal({ active }: { active: boolean }) {
  const clipId = useId().replace(/:/g, "");
  const gooId = `${clipId}-goo`;
  const gradientId = `${clipId}-gradient`;

  return (
    <div className="salite-wordmark-stage" aria-label="SaliteOne">
      <svg viewBox="0 0 860 200" className="salite-wordmark-svg" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="var(--logo-line-1)" />
            <stop offset="30%" stopColor="var(--logo-line-2)" />
            <stop offset="68%" stopColor="var(--logo-line-3)" />
            <stop offset="100%" stopColor="var(--logo-line-4)" />
          </linearGradient>
          <filter id={gooId}>
            <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="
                1 0 0 0 0
                0 1 0 0 0
                0 0 1 0 0
                0 0 0 22 -9
              "
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
          <clipPath id={clipId}>
            <text x="430" y="110" textAnchor="middle" className="salite-wordmark-mask">
              SaliteOne
            </text>
          </clipPath>
        </defs>

        <motion.ellipse
          className="salite-wordmark-backdrop"
          cx="250"
          cy="92"
          rx="170"
          ry="108"
          fill={`url(#${gradientId})`}
          initial={{ opacity: 0, scale: 0.78, x: -42 }}
          animate={
            active
              ? { opacity: [0, 0.34, 0.2, 0.24], scale: [0.78, 1, 1.1, 1.16], x: [-42, -12, 10, 18] }
              : { opacity: 0, scale: 0.78, x: -42 }
          }
          transition={{ duration: 3.8, ease: [0.22, 1, 0.36, 1] }}
        />

        <g clipPath={`url(#${clipId})`}>
          <g filter={`url(#${gooId})`}>
            <motion.ellipse
              fill={`url(#${gradientId})`}
              initial={{ cx: 206, cy: 104, rx: 176, ry: 112, opacity: 0 }}
              animate={
                active
                  ? {
                      cx: [206, 250, 344, 356],
                      cy: [104, 106, 106, 107],
                      rx: [176, 184, 238, 258],
                      ry: [112, 104, 82, 88],
                      opacity: [0, 0.96, 0.92, 0.9],
                    }
                  : { cx: 206, cy: 104, rx: 176, ry: 112, opacity: 0 }
              }
              transition={{
                duration: 3.6,
                ease: [0.22, 1, 0.36, 1],
                times: [0, 0.28, 0.72, 1],
              }}
            />
            <motion.circle
              fill="var(--logo-line-2)"
              initial={{ cx: 220, cy: 86, r: 74, opacity: 0 }}
              animate={
                active
                  ? { cx: [220, 286, 394, 408], cy: [86, 88, 96, 98], r: [74, 78, 64, 68], opacity: [0, 0.9, 0.86, 0.8] }
                  : { cx: 220, cy: 86, r: 74, opacity: 0 }
              }
              transition={{ duration: 3.4, delay: 0.12, ease: [0.22, 1, 0.36, 1], times: [0, 0.26, 0.74, 1] }}
            />
            <motion.circle
              fill="var(--logo-line-3)"
              initial={{ cx: 250, cy: 112, r: 64, opacity: 0 }}
              animate={
                active
                  ? { cx: [250, 344, 506, 520], cy: [112, 112, 108, 108], r: [64, 76, 70, 74], opacity: [0, 0.88, 0.82, 0.76] }
                  : { cx: 250, cy: 112, r: 64, opacity: 0 }
              }
              transition={{ duration: 3.5, delay: 0.24, ease: [0.22, 1, 0.36, 1], times: [0, 0.28, 0.78, 1] }}
            />
            <motion.circle
              fill="var(--logo-line-4)"
              initial={{ cx: 236, cy: 126, r: 54, opacity: 0 }}
              animate={
                active
                  ? { cx: [236, 332, 562, 576], cy: [126, 122, 116, 114], r: [54, 68, 64, 68], opacity: [0, 0.86, 0.78, 0.74] }
                  : { cx: 236, cy: 126, r: 54, opacity: 0 }
              }
              transition={{ duration: 3.65, delay: 0.34, ease: [0.22, 1, 0.36, 1], times: [0, 0.3, 0.8, 1] }}
            />
            <motion.circle
              fill="var(--logo-line-1)"
              initial={{ cx: 188, cy: 108, r: 58, opacity: 0 }}
              animate={
                active
                  ? { cx: [188, 256, 430, 428], cy: [108, 106, 110, 110], r: [58, 68, 56, 64], opacity: [0, 0.74, 0.64, 0.62] }
                  : { cx: 188, cy: 108, r: 58, opacity: 0 }
              }
              transition={{ duration: 3.3, delay: 0.18, ease: [0.22, 1, 0.36, 1], times: [0, 0.24, 0.76, 1] }}
            />
            <motion.circle
              fill="var(--logo-line-3)"
              initial={{ cx: 310, cy: 94, r: 28, opacity: 0 }}
              animate={
                active
                  ? { cx: [310, 438, 640, 656], cy: [94, 98, 104, 104], r: [28, 44, 40, 42], opacity: [0, 0.76, 0.62, 0.54] }
                  : { cx: 310, cy: 94, r: 28, opacity: 0 }
              }
              transition={{ duration: 3.2, delay: 0.52, ease: [0.22, 1, 0.36, 1], times: [0, 0.28, 0.82, 1] }}
            />
          </g>
        </g>

        <motion.text
          x="430"
          y="110"
          textAnchor="middle"
          className="salite-wordmark-solid"
          initial={{ opacity: 0, y: 16, filter: "blur(14px)" }}
          animate={
            active
              ? { opacity: [0, 0, 0.16], y: [16, 10, 0], filter: ["blur(14px)", "blur(8px)", "blur(0px)"] }
              : { opacity: 0, y: 16, filter: "blur(14px)" }
          }
          transition={{
            duration: 1.1,
            delay: 2.1,
            ease: [0.16, 1, 0.3, 1],
            times: [0, 0.58, 1],
          }}
        >
          SaliteOne
        </motion.text>
      </svg>
      <span className="sr-only">SaliteOne</span>
    </div>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [logoRevealActive, setLogoRevealActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recaptchaReady, setRecaptchaReady] = useState(false);
  const [recaptchaError, setRecaptchaError] = useState("");
  const toast = useToast();
  const { theme, toggleTheme } = useTheme();
  const siteKey = (import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined) || "";
  const isLocalHost =
    typeof window !== "undefined" && ["127.0.0.1", "localhost"].includes(window.location.hostname);
  const shouldUseRecaptcha = Boolean(siteKey) && !isLocalHost;

  const loadRecaptcha = useCallback(() => {
    if (!shouldUseRecaptcha) {
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
    script.onerror = () => setRecaptchaError("Security verification failed to load. Check your network and try again.");
    document.body.appendChild(script);
  }, [shouldUseRecaptcha, siteKey]);

  useEffect(() => {
    loadRecaptcha();
  }, [loadRecaptcha]);

  useEffect(() => {
    const timer = window.setTimeout(() => setLogoRevealActive(true), 680);
    return () => window.clearTimeout(timer);
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setRecaptchaError("");
    let token: string | undefined;
    if (shouldUseRecaptcha) {
      if (!recaptchaReady || !(window as any).grecaptcha) {
        setError("Security verification is still loading. Please wait a moment and try again.");
        setLoading(false);
        return;
      }
      try {
        token = await (window as any).grecaptcha.execute(siteKey, { action: "login" });
      } catch (err) {
        console.error(err);
        setError("We could not verify this sign-in attempt. Please retry.");
        setLoading(false);
        return;
      }
    }
    try {
      await login(email, password, token);
      toast.push("Logged in successfully");
      const session = await whoami();
      window.location.href = session.must_change_password ? "/account" : "/dashboard";
    } catch (err) {
      console.error(err);
      setError(err instanceof Error && err.message ? err.message : "Login failed. Check your credentials and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg text-ink selection:bg-ink/15">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(15,23,42,0.1),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(15,23,42,0.08),transparent_34%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.06),transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.3] [background-image:linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:34px_34px] dark:opacity-[0.18] dark:[background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)]" />
      <motion.button
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        onClick={toggleTheme}
        className="absolute right-5 top-5 z-20 inline-flex h-12 items-center gap-2 rounded-full border border-border bg-card/85 px-4 text-sm font-medium text-ink shadow-soft backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-ink/15 hover:bg-card dark:hover:border-white/15"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={theme}
            initial={{ opacity: 0, y: -10, rotate: -12 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, y: 10, rotate: 12 }}
            transition={{ duration: 0.18 }}
            className="grid h-7 w-7 place-items-center rounded-full bg-ink text-bg"
          >
            {theme === "dark" ? <Moon size={15} className="fill-current" /> : <Sun size={15} className="fill-current" />}
          </motion.span>
        </AnimatePresence>
        <span>{theme === "dark" ? "Dark mode" : "Light mode"}</span>
      </motion.button>

      <div className="relative mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <motion.section
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.58, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 w-full max-w-[980px] overflow-hidden rounded-[36px] border border-border bg-card/92 shadow-[0_20px_80px_rgba(12,15,31,0.12)] backdrop-blur-2xl lg:grid lg:grid-cols-[0.95fr_1.05fr]"
        >
          <div className="absolute inset-x-0 top-0 h-28 bg-[linear-gradient(180deg,rgba(15,23,42,0.08),transparent)] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent)]" />
          <div className="relative overflow-hidden border-b border-border px-6 py-8 sm:px-8 lg:min-h-[640px] lg:border-b-0 lg:border-r lg:px-10 lg:py-10">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(166,27,41,0.18),transparent_28%),radial-gradient(circle_at_82%_22%,rgba(239,75,143,0.2),transparent_26%),radial-gradient(circle_at_76%_78%,rgba(180,83,9,0.18),transparent_30%),linear-gradient(145deg,rgba(15,23,42,0.04),transparent_44%,rgba(15,23,42,0.08))] dark:bg-[radial-gradient(circle_at_18%_18%,rgba(214,54,73,0.24),transparent_28%),radial-gradient(circle_at_82%_22%,rgba(255,118,171,0.26),transparent_26%),radial-gradient(circle_at_76%_78%,rgba(217,119,6,0.22),transparent_30%),linear-gradient(145deg,rgba(255,255,255,0.04),transparent_44%,rgba(255,255,255,0.08))]" />
            <div className="relative flex h-full flex-col justify-between gap-10">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-bg/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-mute backdrop-blur">
                  <ShieldCheck size={14} strokeWidth={2.1} />
                  <span>Secure sign-in</span>
                </div>
                <SaliteOneWordmarkReveal active={logoRevealActive} />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-mute">SaliteOne system</p>
                <p className="max-w-xs text-sm leading-6 text-mute">
                  Smooth, secure access to your workspace.
                </p>
              </div>
            </div>
          </div>

          <div className="relative px-6 py-8 sm:px-8 lg:px-10 lg:py-10">
            <div className="space-y-8">
              <div className="space-y-3 text-center lg:text-left">
                <h1 className="text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-[2.5rem]">
                  Welcome back
                </h1>
                <p className="mx-auto max-w-sm text-sm leading-6 text-mute sm:text-[15px] lg:mx-0">
                  Sign in to continue to your workspace.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="ml-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-mute">
                  Email or username
                </label>
                <div className="group relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-mute transition-colors group-focus-within:text-ink" size={18} />
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="text"
                    required
                    autoComplete="username"
                    autoFocus
                    className="h-14 rounded-2xl border-border bg-bg/72 pl-12 pr-4 text-[15px] shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] transition focus:border-ink/20 focus:bg-card focus:shadow-[0_0_0_4px_rgba(15,23,42,0.06)] dark:shadow-none dark:focus:border-white/20 dark:focus:shadow-[0_0_0_4px_rgba(255,255,255,0.06)]"
                    placeholder="name@example.com or username"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="ml-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-mute">
                  Password
                </label>
                <div className="group relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-mute transition-colors group-focus-within:text-ink" size={18} />
                  <Input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    className="h-14 rounded-2xl border-border bg-bg/72 pl-12 pr-12 text-[15px] shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] transition focus:border-ink/20 focus:bg-card focus:shadow-[0_0_0_4px_rgba(15,23,42,0.06)] dark:shadow-none dark:focus:border-white/20 dark:focus:shadow-[0_0_0_4px_rgba(255,255,255,0.06)]"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-mute transition hover:bg-ink/5 hover:text-ink dark:hover:bg-white/8 dark:hover:text-white"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100"
                  >
                    {error}
                  </motion.div>
                )}
                {!error && recaptchaError && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100"
                  >
                    {recaptchaError}
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.99 }}
                type="submit"
                disabled={loading || (shouldUseRecaptcha ? !recaptchaReady : false)}
                className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 text-sm font-semibold text-bg shadow-[0_18px_40px_rgba(15,23,42,0.18)] transition disabled:cursor-not-allowed disabled:opacity-60 dark:shadow-[0_18px_40px_rgba(255,255,255,0.08)]"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    Signing in
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight size={18} />
                  </>
                )}
              </motion.button>

              <div className="rounded-[24px] border border-border bg-bg/65 px-4 py-3 text-center text-sm text-mute">
                Need help getting in? Use your invite or reset link, or contact your administrator.
                <div className="mt-2">
                  <Link to="/onboard" className="font-semibold text-ink transition hover:text-mute">
                    Open account setup
                  </Link>
                </div>
              </div>

              {shouldUseRecaptcha ? (
                <p className="text-center text-xs leading-5 text-mute">
                  This site is protected by reCAPTCHA and the Google{" "}
                  <a
                    href="https://policies.google.com/privacy"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-ink transition hover:text-mute"
                  >
                    Privacy Policy
                  </a>{" "}
                  and{" "}
                  <a
                    href="https://policies.google.com/terms"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-ink transition hover:text-mute"
                  >
                    Terms of Service
                  </a>{" "}
                  apply.
                </p>
              ) : null}
              </form>
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
