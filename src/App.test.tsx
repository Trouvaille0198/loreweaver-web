import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import "./i18n"
import App from "./App"
import { useAppStore } from "./store/app"

describe("App shell", () => {
  beforeEach(() => {
    useAppStore.setState({ mode: "play" })
  })

  it("renders the app title", () => {
    render(<App />)
    expect(screen.getByRole("heading", { name: "Loreweaver" })).toBeInTheDocument()
  })

  it("starts in play mode (the browser build is play-only — no studio mode)", () => {
    render(<App />)
    expect(screen.getByRole("heading", { name: "Join a table" })).toBeInTheDocument()
    // The studio (pack workbench) needs native file/process access and is not
    // part of the web build; the mode nav offers nothing else to switch to.
    expect(screen.queryByRole("button", { name: "Studio" })).not.toBeInTheDocument()
    expect(screen.queryByText(/start forging/i)).not.toBeInTheDocument()
  })
})
