import { useState, useEffect, useCallback } from 'react';

export function useRecaptcha() {
    const [ready, setReady] = useState(false);
    const [error, setError] = useState("");
    const siteKey = ((import.meta as any).env.VITE_RECAPTCHA_SITE_KEY as string | undefined) || "";

    useEffect(() => {
        if (!siteKey) {
            setReady(false);
            return;
        }
        if (typeof window === "undefined") return;

        if ((window as any).grecaptcha) {
            setReady(true);
            return;
        }

        if (document.getElementById("recaptcha-script")) {
            // Script already loading/loaded, just wait for it? 
            // Ideally we'd hook into onload but if it's already there we assume it's loading.
            // A simple polling or just assuming it will be ready is a bit risky but standard for this simple implementation.
            // Better: check if grecaptcha is available periodically.
            const interval = setInterval(() => {
                if ((window as any).grecaptcha) {
                    setReady(true);
                    clearInterval(interval);
                }
            }, 100);
            return () => clearInterval(interval);
        }

        const script = document.createElement("script");
        script.id = "recaptcha-script";
        script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
        script.async = true;
        script.onload = () => setReady(true);
        script.onerror = () => setError("reCAPTCHA failed to load.");
        document.body.appendChild(script);
    }, [siteKey]);

    const execute = useCallback(async (action: string): Promise<string | undefined> => {
        if (!siteKey) return undefined;
        if (!ready || !(window as any).grecaptcha) {
            throw new Error("reCAPTCHA not ready");
        }
        return (window as any).grecaptcha.execute(siteKey, { action });
    }, [siteKey, ready]);

    return { execute, ready, error, siteKey };
}
