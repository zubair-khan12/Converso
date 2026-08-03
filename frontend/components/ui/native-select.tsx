import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A plain <select> with our field styling and a drawn chevron.
 *
 * Deliberately native rather than a Base UI listbox: these choose an agent or
 * an event type, and the OS picker is the better control on a phone — it's
 * scrollable, searchable by keystroke, and never clipped by an overflow.
 */
function NativeSelect({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <span className="relative block w-full">
      <select
        data-slot="native-select"
        className={cn(
          "field-control h-10 cursor-pointer appearance-none pr-9",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-subtle)]"
      />
    </span>
  )
}

export { NativeSelect }
