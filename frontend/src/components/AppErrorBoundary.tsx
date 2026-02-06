import React from "react";

import { attemptChunkReload, isChunkLoadError } from "@/lib/recovery";

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (attemptChunkReload(error)) {
      return;
    }
    console.error("Application error boundary caught an error", error);
  }

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    const isChunkError = isChunkLoadError(error);
    const title = isChunkError ? "Update available" : "Something went wrong";
    const message = isChunkError
      ? "A new version is ready. Reload to continue."
      : "The application hit an unexpected error. Reloading usually fixes it.";

    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-ink px-6">
        <div className="max-w-md w-full rounded-2xl border border-border bg-card p-6 shadow-soft space-y-4">
          <div>
            <h1 className="text-lg font-semibold">{title}</h1>
            <p className="text-sm text-mute mt-1">{message}</p>
          </div>
          <button
            type="button"
            className="w-full rounded-xl bg-ink text-card px-4 py-2 text-sm font-medium hover:opacity-90 transition"
            onClick={() => window.location.reload()}
          >
            Reload now
          </button>
        </div>
      </div>
    );
  }
}
