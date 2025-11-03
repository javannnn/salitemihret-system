import { ComponentProps } from "react";

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`bg-card rounded-2xl shadow-soft ${className}`} {...props} />;
}

export function Button({ variant = "solid", className = "", ...props }: { variant?: "solid" | "ghost" } & ComponentProps<"button">) {
  const base = "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border transition-colors text-sm";
  const solid = "bg-ink text-white border-ink hover:shadow-ring";
  const ghost = "border-black/10 hover:border-black/20";
  const disabled = props.disabled ? "opacity-50 cursor-not-allowed" : "";
  return (
    <button
      {...props}
      className={`${base} ${variant === "solid" ? solid : ghost} ${disabled} ${className}`}
    />
  );
}

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-black/10 bg-white p-2 outline-none focus:shadow-ring transition ${className}`}
    />
  );
}

export function Textarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-xl border border-black/10 bg-white p-2 outline-none focus:shadow-ring transition ${className}`}
    />
  );
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={`w-full rounded-xl border border-black/10 bg-white p-2 outline-none focus:shadow-ring transition ${className}`}
    />
  );
}

export function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`px-2 py-1 rounded-lg text-xs border border-black/10 ${className}`}>
      {children}
    </span>
  );
}
