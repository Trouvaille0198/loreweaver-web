import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react"

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger" | "success"
export type ButtonSize = "sm" | "md" | "lg" | "icon"

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
  loading?: boolean
}

function joinClasses(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ")
}

/** Canonical interactive control for actions across the application. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    leadingIcon,
    trailingIcon,
    loading = false,
    disabled,
    className,
    children,
    ...props
  },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      className={joinClasses("ui-button", `ui-button--${variant}`, `ui-button--${size}`, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="ui-button-spinner" aria-hidden="true" /> : leadingIcon}
      {children !== undefined ? <span className="ui-button-label">{children}</span> : null}
      {trailingIcon}
    </button>
  )
})

export function ArrowLeftIcon() {
  return (
    <svg className="ui-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="m11.5 4.5-5 5.5 5 5.5M7 10h7" />
    </svg>
  )
}
