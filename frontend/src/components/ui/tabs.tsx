"use client";

import { Tabs as T } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

export const Tabs = T.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return (
    <div className="relative -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <T.List className={cn("flex min-w-max gap-1 border-b", className)} {...props} />
    </div>
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        "-mb-px inline-flex h-10 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium text-fg-muted hover:text-fg",
        "data-[state=active]:border-brand data-[state=active]:text-fg",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof T.Content>) {
  return <T.Content className={cn("pt-5 outline-none", className)} {...props} />;
}
