"use client";

import { Tooltip as T } from "radix-ui";
import * as React from "react";

export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <T.Root delayDuration={150}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          sideOffset={6}
          className="z-50 max-w-xs rounded-md bg-[#111827] px-2.5 py-1.5 text-xs leading-snug text-white shadow-overlay"
        >
          {content}
          <T.Arrow className="fill-[#111827]" />
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

export const TooltipProvider = T.Provider;

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-surface-2 ${className ?? ""}`} />;
}
