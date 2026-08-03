import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Multi-line field matching the Input primitive. Four screens had each pasted
 * their own `fieldClass` string for this; they now share one control, so a
 * focus ring or radius change lands everywhere at once.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn("field-control resize-y leading-relaxed", className)}
      {...props}
    />
  )
}

export { Textarea }
