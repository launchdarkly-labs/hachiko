import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import Counter from "./Counter"

/**
 * Test file for Counter component.
 * These tests should continue to pass after migration to hooks.
 */
describe("Counter", () => {
  it("renders with initial value", () => {
    render(<Counter initialValue={5} />)
    expect(screen.getByText("Count: 5")).toBeInTheDocument()
  })

  it("renders with default initial value of 0", async () => {
    render(<Counter />)

    // Should show loading initially
    expect(screen.getByText("Loading...")).toBeInTheDocument()

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByText("Count: 0")).toBeInTheDocument()
    })
  })

  it("increments count when + button is clicked", async () => {
    render(<Counter />)

    await waitFor(() => {
      expect(screen.getByText("Count: 0")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("+"))
    expect(screen.getByText("Count: 1")).toBeInTheDocument()
  })

  it("decrements count when - button is clicked", async () => {
    render(<Counter initialValue={5} />)

    await waitFor(() => {
      expect(screen.getByText("Count: 5")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("-"))
    expect(screen.getByText("Count: 4")).toBeInTheDocument()
  })

  it("resets to initial value when reset is clicked", async () => {
    render(<Counter initialValue={10} />)

    await waitFor(() => {
      expect(screen.getByText("Count: 10")).toBeInTheDocument()
    })

    // Change the count
    fireEvent.click(screen.getByText("+"))
    expect(screen.getByText("Count: 11")).toBeInTheDocument()

    // Reset
    fireEvent.click(screen.getByText("Reset"))
    expect(screen.getByText("Count: 10")).toBeInTheDocument()
  })

  it("calls onCountChange when count changes", async () => {
    const onCountChange = jest.fn()
    render(<Counter initialValue={0} onCountChange={onCountChange} />)

    await waitFor(() => {
      expect(screen.getByText("Count: 0")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("+"))

    expect(onCountChange).toHaveBeenCalledWith(1)
  })
})
