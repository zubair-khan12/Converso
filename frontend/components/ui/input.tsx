import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/**
 * Sizes match the rest of the form controls: `default` is a comfortable 40px
 * touch target (the stock shadcn 32px is too tight for a field a customer
 * types an API key into on a phone), `lg` is for the login and setup forms
 * where the field is the whole screen's subject.
 */
function Input({
  className,
  type,
  inputSize = "default",
  ...props
}: React.ComponentProps<"input"> & { inputSize?: "sm" | "default" | "lg" }) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "w-full min-w-0 rounded-[var(--radius)] border border-input bg-[var(--surface)] text-[var(--ink)] transition-colors outline-none",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        "placeholder:text-[var(--ink-subtle)]",
        "focus-visible:border-[var(--amber)] focus-visible:ring-3 focus-visible:ring-[var(--accent-soft)]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-[var(--surface-sunk)] disabled:opacity-60",
        "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        inputSize === "sm" && "h-9 px-3 text-sm",
        inputSize === "default" && "h-10 px-3 text-[0.9375rem]",
        inputSize === "lg" && "h-12 px-3.5 text-base",
        className
      )}
      {...props}
    />
  )
}

export { Input }
