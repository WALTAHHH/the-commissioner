import type { ComponentProps } from "react"
import { cn } from "cn"
import { inputBaseClass } from "@/components/ui/input"

/**
 * Design-system native select. Keeps the browser's own dropdown affordance
 * (no custom popup, identical behavior on mobile) while adopting the shared
 * border/focus ring treatment from `Input`.
 */
function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(inputBaseClass, "cursor-pointer", className)}
      {...props}
    />
  )
}

export { Select }
