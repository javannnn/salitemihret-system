import { ComponentProps } from "react";

const fieldBase =
  "w-full rounded-xl border border-border bg-card/80 text-ink placeholder:text-mute/70 p-2 outline-none transition focus:border-accent focus:shadow-ring focus:shadow-accent/40";

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      className={`bg-card/90 backdrop-blur rounded-2xl shadow-soft border border-border ${className}`}
      {...props}
    />
  );
}

type ButtonVariant = "solid" | "ghost" | "soft";

export function Button({
  variant = "solid",
  className = "",
  ...props
}: { variant?: ButtonVariant } & ComponentProps<"button">) {
  const base =
    "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2";
  const solid =
    "bg-accent text-accent-foreground border-accent hover:shadow-ring hover:-translate-y-0.5";
  const ghost =
    "border-border hover:border-accent/40 hover:bg-accent/10 text-ink dark:text-accent-foreground/90";
  const soft =
    "border-transparent bg-accent/10 text-accent hover:bg-accent/20";
  const disabled = props.disabled ? "opacity-50 cursor-not-allowed" : "";
  const variantClass =
    variant === "solid" ? solid : variant === "soft" ? soft : ghost;

  return (
    <button
      {...props}
      className={`${base} ${variantClass} ${disabled} ${className}`}
    />
  );
}

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`${fieldBase} ${className}`} />;
}

export function Textarea({
  className = "",
  ...props
}: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${fieldBase} ${className}`} />;
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select {...props} className={`${fieldBase} ${className}`} />;
}

export function Badge({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`px-2 py-1 rounded-lg text-xs border border-border bg-card/70 text-mute uppercase tracking-wide ${className}`}
    >
      {children}
    </span>
  );
}
