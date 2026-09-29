import CountdownTimer, { useChainNow } from "./CountdownTimer";
import { fmtEth, shortAddr } from "../utils/formatters";

export default function RecoveryView({ c, address, delay }) {
  const { state, send, sendToSimple, pending, advanceTime } = c;
  const r = state.recovery;
  const now = useChainNow(state);
  const unlocked = r.active && r.executionTime > 0 && now >= r.executionTime;
  const isProposed = r.active && address?.toLowerCase() === r.proposedOwner.toLowerCase();
  const pct = Math.min(100, (r.approvalCount / 2) * 100);

  return (
    <div className="grid">
      <section className={`card ${r.active ? "alert" : ""}`}>
        <h2>Current recovery request</h2>
        {r.active ? (
          <>
            <dl className="kv">
              <dt>Request</dt>
              <dd>#{r.requestId}</dd>
              <dt>Proposed owner</dt>
              <dd className="mono">{shortAddr(r.proposedOwner)}</dd>
            </dl>
            <p className="muted small">Guardian approvals</p>
            <div className="bar big">
              <div className={`bar-fill ${r.approvalCount >= 2 ? "green" : "blue"}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="small">{r.approvalCount} / 2 approvals</p>

            <h3>Time-lock</h3>
            <CountdownTimer state={state} delay={delay} />

            {!isProposed && (
              <p className="notice warn">Only the proposed owner ({shortAddr(r.proposedOwner)}) can execute. Switch to that account.</p>
            )}
            <button
              className={`btn ${unlocked ? "success" : "outline"}`}
              disabled={!!pending}
              onClick={() => send("executeRecovery", [], {}, "Execute recovery")}
              title={unlocked ? "" : "The contract will reject this until the waiting period ends"}
            >
              {pending === "executeRecovery" ? "Executing…" : unlocked ? "Execute recovery" : "Execute recovery (time-locked)"}
            </button>

            <div className="devtools">
              <p className="small">
                <b>Demo only.</b> Advance the local blockchain clock by 3 days (evm_increaseTime + evm_mine). The contract
                still enforces the full delay; only the chain&apos;s clock moves.
              </p>
              <button className="btn outline small-btn" disabled={!!pending} onClick={() => advanceTime(delay)}>
                {pending === "advanceTime" ? "Advancing…" : "Advance chain time 3 days"}
              </button>
            </div>
          </>
        ) : (
          <p className="muted">No recovery in progress. A guardian starts one from the Guardian tab.</p>
        )}
      </section>

      <section className="card">
        <h2>Recovery rules</h2>
        <ul className="rules">
          <li>2 of the 3 guardians must approve the same new owner.</li>
          <li>A 3-day waiting period starts when the 2nd approval lands.</li>
          <li>The owner can cancel at any time before execution.</li>
          <li>Only the proposed owner can execute, after the delay.</li>
          <li>Cancelling burns the request number, so old approvals can never be replayed.</li>
        </ul>
      </section>

      {state.simple && (
        <section className="card compare">
          <h2>Without GuardianVault</h2>
          <p className="muted small">A plain owner-only wallet (SimpleWallet.sol) holding funds after its owner lost the key.</p>
          <div className="balance small-balance">{fmtEth(state.simple.balance)}</div>
          <p className="small">
            Owner <span className="mono">{shortAddr(state.simple.owner)}</span> · no function exists to change it.
          </p>
          <button
            className="btn outline"
            disabled={!!pending}
            onClick={() => sendToSimple("transfer", [address, 1n], "Withdraw from SimpleWallet")}
          >
            Try to withdraw as {shortAddr(address)}
          </button>
        </section>
      )}
    </div>
  );
}
