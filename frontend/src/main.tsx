import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./index.css";
import { ToastProvider } from "@/components/Toast";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { TourProvider } from "@/context/TourContext";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { attemptChunkReload } from "@/lib/recovery";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    if (attemptChunkReload(event.reason)) {
      event.preventDefault();
    }
  });
  window.addEventListener("error", (event) => {
    if (attemptChunkReload(event.error || event.message)) {
      event.preventDefault();
    }
  });
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <TourProvider>
              <AppErrorBoundary>
                <App />
              </AppErrorBoundary>
            </TourProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
