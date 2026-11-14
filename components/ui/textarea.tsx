import type { ComponentProps } from "react"
import { cn } from "cn"
import { inputBaseClass } from "@/components/ui/input"

/**
 * Design-system textarea. Same border/focus ring language as `Input`
 * (see components/ui/input.tsx); `resize-y` prevents sideways overflow while
 * still letting users grow tall bodies.
 */
function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(inputBaseClass, "min-h-20 resize-y", className)}
      {...props}
    />
  )
}

export { Textarea }
