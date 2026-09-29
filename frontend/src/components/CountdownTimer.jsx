import { fmtDuration } from "../utils/formatters";

/**
 * Countdown based on ON-CHAIN time (latest block timestamp), not the laptop clock,
 * so an evm_increaseTime + evm_mine jump is reflected immediately.
 */
export function useChainNow(state) {
  return state?.chainTime ?? 0;
}

export default function CountdownTimer({ state, delay }) {
  const now = useChainNow(state);
  const r = state?.recovery;
  if (!r?.active) return <p className="muted">No active recovery.</p>;
  if (!r.executionTime) return <p className="muted">Timer starts when the 2nd guardian approves.</p>;

  const remaining = Math.max(0, r.executionTime - now);
  const elapsedPct = Math.min(100, Math.max(0, ((delay - remaining) / delay) * 100));
  return (
    <div className="countdown">
      <div className={`countdown-value ${remaining === 0 ? "done" : ""}`}>
        {remaining === 0 ? "Waiting period complete" : fmtDuration(remaining)}
      </div>
      <div className="bar" aria-label={`${elapsedPct.toFixed(0)}% of waiting period elapsed`}>
        <div className={`bar-fill ${remaining === 0 ? "green" : "yellow"}`} style={{ width: `${elapsedPct}%` }} />
      </div>
      <p className="muted small">{elapsedPct.toFixed(0)}% elapsed at the latest confirmed block. Updates when a new block is mined.</p>
    </div>
  );
}
