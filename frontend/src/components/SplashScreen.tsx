import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";

export default function SplashScreen() {
    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#F5F5F7] dark:bg-[#050505]">
            <div className="relative flex items-center justify-center">
                {/* Logo Container */}
                <motion.div
                    className="flex items-center gap-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                >
                    {/* Animated Icon */}
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{
                            duration: 0.8,
                            ease: [0.16, 1, 0.3, 1],
                        }}
                        className="relative z-10 flex h-20 w-20 items-center justify-center rounded-2xl bg-black text-white shadow-2xl dark:bg-white dark:text-black"
                    >
                        <ShieldCheck size={48} strokeWidth={2} />
                    </motion.div>

                    {/* Text Reveal */}
                    <div className="overflow-hidden">
                        <motion.div
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{
                                delay: 0.4,
                                duration: 0.8,
                                ease: [0.16, 1, 0.3, 1],
                            }}
                        >
                            <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
                                SaliteOne
                            </h1>
                        </motion.div>
                    </div>
                </motion.div>
            </div>

            {/* Loading Bar */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.5 }}
                className="absolute bottom-20 w-64"
            >
                <div className="h-1 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                    <motion.div
                        className="h-full bg-black dark:bg-white"
                        initial={{ x: "-100%" }}
                        animate={{ x: "100%" }}
                        transition={{
                            repeat: Infinity,
                            duration: 1.5,
                            ease: "easeInOut",
                        }}
                    />
                </div>
            </motion.div>

            {/* Powered By Footer */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1, duration: 0.5 }}
                className="absolute bottom-8 text-[10px] font-medium uppercase tracking-widest text-gray-400 dark:text-gray-600"
            >
                Powered By Ace-Tech Software Development
            </motion.div>
        </div>
    );
}
