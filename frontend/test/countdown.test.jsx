import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import CountdownTimer from "../src/components/CountdownTimer";

afterEach(() => vi.useRealTimers());

describe("Confirmed block countdown", () => {
  it("does not unlock when the computer clock moves, but unlocks at the confirmed deadline", () => {
    vi.useFakeTimers();
    const state = { chainTime: 100, fetchedAt: Date.now(), recovery: { active: true, executionTime: 200 } };
    const { rerender } = render(<CountdownTimer state={state} delay={100} />);
    expect(screen.queryByText("Waiting period complete")).toBeNull();
    vi.setSystemTime(Date.now() + 10 * 86400000);
    rerender(<CountdownTimer state={state} delay={100} />);
    expect(screen.queryByText("Waiting period complete")).toBeNull();
    rerender(<CountdownTimer state={{ ...state, chainTime: 199 }} delay={100} />);
    expect(screen.queryByText("Waiting period complete")).toBeNull();
    rerender(<CountdownTimer state={{ ...state, chainTime: 200 }} delay={100} />);
    expect(screen.getByText("Waiting period complete")).toBeTruthy();
  });

  it("does not start a timer before threshold", () => {
    render(<CountdownTimer state={{ chainTime: 500, recovery: { active: true, executionTime: 0 } }} delay={100} />);
    expect(screen.getByText("Timer starts when the 2nd guardian approves.")).toBeTruthy();
  });
});
