import { Flag } from "lucide-react";
import type { InputHTMLAttributes } from "react";

import { formatCanadianPhoneInput } from "@/lib/validation";

type PhoneInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
};

export function PhoneInput({ value, onChange, className = "", disabled, ...props }: PhoneInputProps) {
  const nationalDigits = value.startsWith("+1") ? value.slice(2) : value.replace(/\D/g, "");

  return (
    <div
      className={`flex items-center rounded-xl border border-border bg-card/80 text-ink transition focus-within:border-accent focus-within:shadow-ring focus-within:shadow-accent/30 ${
        disabled ? "opacity-60 cursor-not-allowed" : ""
      } ${className}`}
    >
      <div className="flex items-center gap-2 px-3 py-2 text-sm uppercase tracking-wide text-mute border-r border-border/70 bg-muted/30">
        <Flag className="h-4 w-4 text-rose-500" aria-hidden />
        <span className="font-semibold">+1</span>
      </div>
      <input
        {...props}
        type="tel"
        inputMode="tel"
        disabled={disabled}
        className="flex-1 bg-transparent px-3 py-2 outline-none placeholder:text-mute/70 text-base"
        value={nationalDigits}
        onChange={(event) => {
          const formatted = formatCanadianPhoneInput(event.target.value);
          onChange(formatted);
        }}
        placeholder="5551234567"
      />
    </div>
  );
}
