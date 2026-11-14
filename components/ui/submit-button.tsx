import type { ComponentProps, ReactNode } from "react"
import { cn } from "cn"
import { buttonVariants } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/**
 * Canonical submit button: while `loading` it is disabled, marked
 * `aria-busy`, and shows a spinner in place of the leading icon slot so the
 * label stays readable. Use it for every form's primary action (and cancel
 * buttons via `variant="outline"`).
 */
type SubmitButtonProps = Omit<ComponentProps<"button">, "type"> & {
  type?: "submit" | "button"
  loading?: boolean
  variant?: NonNullable<Parameters<typeof buttonVariants>[0]>["variant"]
  size?: NonNullable<Parameters<typeof buttonVariants>[0]>["size"]
  children: ReactNode
}

export function SubmitButton({
  loading = false,
  variant = "default",
  size = "default",
  type = "submit",
  disabled,
  className,
  children,
  ...props
}: SubmitButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        buttonVariants({ variant, size }),
        "gap-2",
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  )
}
