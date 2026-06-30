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

type ButtonVariant = "solid" | "ghost" | "soft" | "outline";

export function Button({
  variant = "solid",
  className = "",
  type = "button",
  ...props
}: { variant?: ButtonVariant } & ComponentProps<"button"> & ComponentProps<"a">) {
  const base =
    "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2";
  const solid =
    "bg-accent text-accent-foreground border-accent hover:shadow-ring hover:-translate-y-0.5";
  const ghost =
    "border-border bg-card/40 text-ink hover:border-accent/40 hover:bg-accent/10";
  const soft =
    "border-transparent bg-accent/10 text-accent hover:bg-accent/20";
  const outline =
    "border-border bg-transparent text-ink hover:border-accent/50 hover:bg-muted/50";
  // @ts-ignore
  const disabled = props.disabled ? "opacity-50 cursor-not-allowed" : "";
  const variantClass =
    variant === "solid" ? solid : variant === "soft" ? soft : variant === "outline" ? outline : ghost;

  if ("href" in props && props.href) {
    return (
      <a
        {...(props as ComponentProps<"a">)}
        className={`${base} ${variantClass} ${disabled} ${className}`}
      />
    );
  }

  return (
    <button
      type={type}
      {...(props as ComponentProps<"button">)}
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
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-border bg-card/70 px-2 py-1 text-xs leading-none text-mute uppercase tracking-wide ${className}`}
    >
      {children}
    </span>
  );
}
