import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

export type Tone = "ok" | "warn" | "danger" | "info" | "neutral" | "brand";

const badge = cva("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", {
  variants: {
    tone: {
      ok: "bg-ok-bg text-ok",
      warn: "bg-warn-bg text-warn",
      danger: "bg-danger-bg text-danger",
      info: "bg-info-bg text-info",
      neutral: "bg-neutral-bg text-neutral",
      brand: "bg-[color-mix(in_oklab,var(--brand)_12%,transparent)] text-brand",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({
  className,
  tone,
  dot,
  children,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badge> & { dot?: boolean }) {
  return (
    <span className={cn(badge({ tone }), className)} {...props}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
