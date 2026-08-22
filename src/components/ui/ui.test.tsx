import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Button, Field, Notice } from "."

describe("UI primitives", () => {
  it("exposes button variants and loading state consistently", () => {
    render(
      <Button variant="primary" loading>
        Save
      </Button>,
    )
    const button = screen.getByRole("button", { name: "Save" })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("aria-busy", "true")
    expect(button).toHaveClass("ui-button--primary", "ui-button--md")
  })

  it("associates field labels and supporting text with their control", () => {
    render(
      <Field label="Room" hint="Required">
        {({ id, describedBy }) => <input id={id} aria-describedby={describedBy} />}
      </Field>,
    )
    const input = screen.getByRole("textbox", { name: "Room" })
    expect(input).toHaveAccessibleDescription("Required")
  })

  it("uses an alert role for destructive feedback", () => {
    render(
      <Notice tone="danger" role="alert">
        Failed
      </Notice>,
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Failed")
  })
})
