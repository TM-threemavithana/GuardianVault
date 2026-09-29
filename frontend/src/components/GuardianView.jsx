import { useEffect, useState } from "react";
import AddressInput from "./AddressInput";
import { shortAddr } from "../utils/formatters";

export default function GuardianView({ c, address, deployment }) {
  const { state, send, pending } = c;
  const r = state.recovery;
  const [newOwner, setNewOwner] = useState("");
  const [approveFor, setApproveFor] = useState("");

  useEffect(() => {
    if (r.active) setApproveFor(r.proposedOwner);
  }, [r.active, r.proposedOwner]);

  const myIndex = state.guardians.findIndex((g) => g.toLowerCase() === address?.toLowerCase());
  const iApproved = myIndex >= 0 && state.approvals[myIndex];

  return (
    <div className="grid">
      <section className="card">
        <h2>Guardian panel</h2>
        {myIndex >= 0 ? (
          <p className="status-line ok-text">Connected as Guardian {myIndex + 1} ({shortAddr(address)})</p>
        ) : (
          <p className="notice warn">
            {shortAddr(address)} is not a guardian. The contract will reject proposals and approvals from this account.
          </p>
        )}
        <h3>Propose a new owner</h3>
        <p className="muted small">Use this when the owner has lost their key. Proposing counts as your approval.</p>
        <AddressInput id="prop" label="New owner address" value={newOwner} onChange={setNewOwner} roles={deployment.roles} fills={["newOwner", "attacker"]} />
        <button
          className="btn primary"
          disabled={!!pending || !newOwner}
          onClick={() => send("proposeRecovery", [newOwner], {}, "Propose recovery")}
        >
          {pending === "proposeRecovery" ? "Proposing…" : "Propose recovery"}
        </button>
      </section>

      <section className={`card ${r.active ? "alert" : ""}`}>
        <h2>Active recovery</h2>
        {r.active ? (
          <>
            <dl className="kv">
              <dt>Request</dt>
              <dd>#{r.requestId}</dd>
              <dt>Proposed owner</dt>
              <dd className="mono">{shortAddr(r.proposedOwner)}</dd>
              <dt>Approvals</dt>
              <dd>
                {r.approvalCount} of 2 {r.approvalCount < 2 ? `(need ${2 - r.approvalCount} more)` : "(threshold met)"}
              </dd>
            </dl>
            <ul className="approvals">
              {state.guardians.map((g, i) => (
                <li key={g} className={state.approvals[i] ? "yes" : ""}>
                  <span className="tick" aria-hidden="true">{state.approvals[i] ? "✓" : "·"}</span>
                  Guardian {i + 1} <span className="mono muted">{shortAddr(g)}</span>
                  <span className="muted small">{state.approvals[i] ? "approved" : "not yet"}</span>
                </li>
              ))}
            </ul>
            {iApproved && <p className="muted small">You already approved this request. Approving again will be rejected.</p>}
            <AddressInput id="appr" label="Approve new owner" value={approveFor} onChange={setApproveFor} roles={deployment.roles} fills={["newOwner", "attacker"]} />
            <button
              className="btn primary"
              disabled={!!pending || !approveFor}
              onClick={() => send("approveRecovery", [approveFor], {}, "Approve recovery")}
            >
              {pending === "approveRecovery" ? "Approving…" : "Approve recovery"}
            </button>
          </>
        ) : (
          <>
            <p className="muted">No active request. Any guardian can propose one.</p>
            {r.requestId > 0 && (
              <p className="muted small">
                Last request was #{r.requestId}. Approvals are bound to a request number, so old approvals never carry over.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
