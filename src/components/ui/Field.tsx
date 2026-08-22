import { useId, type ReactNode } from "react"

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  children: (control: { id: string; describedBy?: string; invalid: boolean }) => ReactNode
  className?: string
}) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined

  return (
    <div className={`ui-field${className ? ` ${className}` : ""}`}>
      <label className="ui-field-label" htmlFor={id}>
        {label}
      </label>
      {children({
        id,
        describedBy: [hintId, errorId].filter(Boolean).join(" ") || undefined,
        invalid: Boolean(error),
      })}
      {hint ? (
        <p className="ui-field-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="ui-field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
