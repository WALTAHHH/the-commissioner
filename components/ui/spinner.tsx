import { Loader2 } from "lucide-react"
import { cn } from "cn"

/**
 * Design-system spinner. Decorative by definition — busy state is announced
 * through `aria-busy`/`aria-live` on the control, so this is always hidden
 * from assistive tech.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      aria-hidden="true"
      className={cn("size-4 animate-spin", className)}
    />
  )
}
