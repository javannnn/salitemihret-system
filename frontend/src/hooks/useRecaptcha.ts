import { useCallback, useEffect, useState } from "react";

type RecaptchaApi = {
  ready: (callback: () => void) => void;
  execute: (siteKey: string, options: { action: string }) => Promise<string>;
};

const RECAPTCHA_SCRIPT_ID = "recaptcha-script";
const RECAPTCHA_LOAD_TIMEOUT_MS = 15_000;
const RECAPTCHA_EXECUTION_TIMEOUT_MS = 15_000;

function getRecaptchaApi(): RecaptchaApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { grecaptcha?: RecaptchaApi }).grecaptcha;
}

export function useRecaptcha() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const siteKey = ((import.meta as any).env.VITE_RECAPTCHA_SITE_KEY as string | undefined) || "";

  useEffect(() => {
    if (!siteKey) {
      setReady(false);
      setError("");
      return;
    }
    if (typeof window === "undefined") return;

    let active = true;
    let settled = false;
    let script = document.getElementById(RECAPTCHA_SCRIPT_ID) as HTMLScriptElement | null;

    setReady(false);
    setError("");

    const markReadyWhenAvailable = () => {
      const api = getRecaptchaApi();
      if (!api) return false;
      api.ready(() => {
        if (!active) return;
        settled = true;
        setReady(true);
        setError("");
      });
      return true;
    };

    const handleLoad = () => {
      if (!markReadyWhenAvailable() && active) {
        settled = true;
        setError("Security verification loaded incorrectly. Please retry.");
      }
    };

    const handleError = () => {
      if (!active) return;
      settled = true;
      setReady(false);
      setError("Security verification could not load. Check your connection and retry.");
    };

    if (!markReadyWhenAvailable()) {
      if (!script) {
        script = document.createElement("script");
        script.id = RECAPTCHA_SCRIPT_ID;
        script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", handleLoad);
      script.addEventListener("error", handleError);
    }

    const timeoutId = window.setTimeout(() => {
      if (!active || settled) return;
      setReady(false);
      setError("Security verification is taking too long. Please retry.");
    }, RECAPTCHA_LOAD_TIMEOUT_MS);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      script?.removeEventListener("load", handleLoad);
      script?.removeEventListener("error", handleError);
    };
  }, [loadAttempt, siteKey]);

  const retry = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!getRecaptchaApi()) {
      document.getElementById(RECAPTCHA_SCRIPT_ID)?.remove();
    }
    setReady(false);
    setError("");
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  const execute = useCallback(async (action: string): Promise<string | undefined> => {
    if (!siteKey) return undefined;
    const api = getRecaptchaApi();
    if (!ready || !api) {
      throw new Error("reCAPTCHA not ready");
    }

    let timeoutId: number | undefined;
    const execution = new Promise<string>((resolve, reject) => {
      api.ready(() => {
        try {
          api.execute(siteKey, { action }).then(resolve).catch(reject);
        } catch (error) {
          reject(error);
        }
      });
    });
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(
        () => reject(new Error("reCAPTCHA timed out")),
        RECAPTCHA_EXECUTION_TIMEOUT_MS
      );
    });

    try {
      return await Promise.race([execution, timeout]);
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    }
  }, [siteKey, ready]);

  return { execute, ready, error, retry, siteKey };
}
