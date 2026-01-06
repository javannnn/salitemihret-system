import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === "dark";
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        setIsAnimating(true);
        const timer = setTimeout(() => setIsAnimating(false), 2000); // 2 seconds for full effect
        return () => clearTimeout(timer);
    }, [theme]);

    return (
        <button
            onClick={toggleTheme}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-transparent text-ink hover:bg-accent/10 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 overflow-hidden"
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
            <AnimatePresence mode="wait">
                {isAnimating ? (
                    isDark ? (
                        <RichMoon key="rich-moon" />
                    ) : (
                        <RichSun key="rich-sun" />
                    )
                ) : (
                    <motion.div
                        key="minimal-icon"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                    >
                        {isDark ? <Moon size={20} /> : <Sun size={20} />}
                    </motion.div>
                )}
            </AnimatePresence>
        </button>
    );
}

function RichSun() {
    return (
        <motion.svg
            key="rich-sun-svg"
            width="32"
            height="32"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            initial={{ y: 20, opacity: 0, scale: 0.5 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ scale: 1.5, opacity: 0, transition: { duration: 0.5 } }}
            transition={{ type: "spring", stiffness: 100, damping: 12, duration: 1 }}
        >
            <defs>
                <radialGradient id="sunrise-gradient" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(16 16) rotate(90) scale(16)">
                    <stop stopColor="#FDB813" />
                    <stop offset="0.6" stopColor="#F58220" />
                    <stop offset="1" stopColor="#EF4136" />
                </radialGradient>
                <filter id="sun-glow">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                    <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>
            <g style={{ filter: "url(#sun-glow)" }}>
                {/* Sun Body - Rising up */}
                <circle cx="16" cy="16" r="8" fill="url(#sunrise-gradient)" />

                {/* Rays - Bursting out after rise */}
                {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
                    <motion.line
                        key={i}
                        x1="16"
                        y1="4"
                        x2="16"
                        y2="1"
                        stroke="#F58220"
                        strokeWidth="2"
                        strokeLinecap="round"
                        transform={`rotate(${angle} 16 16)`}
                        initial={{ opacity: 0, pathLength: 0 }}
                        animate={{ opacity: 1, pathLength: 1 }}
                        transition={{ delay: 0.5 + i * 0.05, duration: 0.4 }}
                    />
                ))}
            </g>
        </motion.svg>
    );
}

function RichMoon() {
    return (
        <motion.svg
            key="rich-moon-svg"
            width="28"
            height="28"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            initial={{ scale: 0.8, rotate: -20, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0, transition: { duration: 0.5 } }}
            transition={{ duration: 1, ease: "easeOut" }}
        >
            <defs>
                <linearGradient id="moon-gradient" x1="10" y1="5" x2="22" y2="27" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#E2E8F0" />
                    <stop offset="1" stopColor="#94A3B8" />
                </linearGradient>
                <filter id="moon-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
                    <feColorMatrix in="blur" type="matrix" values="
                        0 0 0 0 0.8
                        0 0 0 0 0.9
                        0 0 0 0 1
                        0 0 0 1 0" result="glow-color" />
                    <feMerge>
                        <feMergeNode in="glow-color" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>
            <g style={{ filter: "url(#moon-glow)" }}>
                {/* Moon Body */}
                <circle cx="16" cy="16" r="10" fill="url(#moon-gradient)" />

                {/* Craters */}
                <circle cx="12" cy="12" r="2" fill="#64748B" opacity="0.4" />
                <circle cx="18" cy="10" r="1.5" fill="#64748B" opacity="0.3" />
                <circle cx="19" cy="20" r="3" fill="#64748B" opacity="0.3" />

                {/* Rim Light */}
                <path
                    d="M23 16C23 19.866 19.866 23 16 23C13.5 23 11.2 21.8 9.8 19.8C10.8 22.8 13.5 25 16.5 25C20.6 25 24 21.6 24 17.5C24 15.5 23.2 13.5 21.8 12C22.6 13.2 23 14.6 23 16Z"
                    fill="white"
                    opacity="0.2"
                />
            </g>
        </motion.svg>
    );
}
