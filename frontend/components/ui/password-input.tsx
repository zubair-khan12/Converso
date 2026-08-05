"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** A password field with an in-field reveal toggle.
 *
 *  The toggle sits inside the control rather than beside it so the input keeps
 *  the full column width — and it exists at all because a password typed
 *  blind into a signup form is the most common reason a new account can't be
 *  signed into five minutes later. */
export function PasswordInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pr-12", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        // Not in the tab order: it's a convenience, and stopping between the
        // password field and the submit button on every sign-in is friction
        // for keyboard users who don't need it.
        tabIndex={-1}
        className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-[var(--radius)] text-[var(--ink-subtle)] transition-colors hover:bg-[var(--surface-sunk)] hover:text-[var(--ink)]"
      >
        {visible ? (
          <EyeOff className="h-4.5 w-4.5" />
        ) : (
          <Eye className="h-4.5 w-4.5" />
        )}
      </button>
    </div>
  );
}
