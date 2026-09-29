import { useState } from "react";
import { parseEther } from "ethers";
import AddressInput from "./AddressInput";
import CountdownTimer from "./CountdownTimer";
import { fmtEth, shortAddr } from "../utils/formatters";

export default function OwnerView({ c, deployment, delay, isOwner }) {
  const { state, send, pending } = c;
  const roles = deployment.roles;
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("1");
  const [depositAmt, setDepositAmt] = useState("5");
  const [oldG, setOldG] = useState("");
  const [newG, setNewG] = useState("");

  const toWei = (v) => {
    try {
      return parseEther(v || "0");
    } catch {
      return null;
    }
  };
  const r = state.recovery;

  return (
    <div className="grid">
      <section className="card hero">
        <p className="muted">Wallet balance</p>
        <div className="balance">{fmtEth(state.balance)}</div>
        <p className="muted small">
          Held by the contract at <span className="mono">{shortAddr(deployment.guardianVault)}</span>. Owner:{" "}
          <span className="mono">{shortAddr(state.owner)}</span>
        </p>
        {!isOwner && (
          <p className="notice warn">
            You are not the owner. Owner-only actions below will be rejected by the contract — try them to see the defence.
          </p>
        )}
        <div className="row">
          <div className="field grow">
            <label htmlFor="dep">Deposit (anyone can fund the wallet)</label>
            <input id="dep" inputMode="decimal" value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)} />
          </div>
          <button
            className="btn"
            disabled={!!pending || !toWei(depositAmt)}
            onClick={() => send("deposit", [], { value: toWei(depositAmt) }, `Deposit ${depositAmt} ETH`)}
          >
            {pending === "deposit" ? "Depositing…" : "Deposit ETH"}
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Send ETH</h2>
        <AddressInput id="to" label="Recipient" value={to} onChange={setTo} roles={roles} fills={["attacker", "newOwner", "guardian1"]} />
        <div className="field">
          <label htmlFor="amt">Amount (ETH)</label>
          <input id="amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <button
          className="btn primary"
          disabled={!!pending || !to}
          onClick={() => send("transfer", [to, toWei(amount) ?? 0n], {}, `Transfer ${amount} ETH`)}
        >
          {pending === "transfer" ? "Sending…" : "Send transaction"}
        </button>
      </section>

      <section className="card">
        <h2>Guardians</h2>
        <ol className="guardian-list">
          {state.guardians.map((g, i) => (
            <li key={g}>
              <span>Guardian {i + 1}</span>
              <span className="mono">{shortAddr(g)}</span>
            </li>
          ))}
        </ol>
        <details>
          <summary>Replace a guardian</summary>
          <AddressInput id="oldg" label="Current guardian" value={oldG} onChange={setOldG} roles={roles} fills={["guardian1", "guardian2", "guardian3"]} />
          <AddressInput id="newg" label="New guardian" value={newG} onChange={setNewG} roles={roles} fills={["attacker"]} />
          <p className="muted small">Replacing a guardian automatically cancels any active recovery, so a compromised guardian cannot block their own removal.</p>
          <button
            className="btn"
            disabled={!!pending || !oldG || !newG}
            onClick={() => send("replaceGuardian", [oldG, newG], {}, "Replace guardian")}
          >
            {pending === "replaceGuardian" ? "Replacing…" : "Replace guardian"}
          </button>
        </details>
      </section>

      <section className={`card ${r.active ? "alert urgent" : ""}`}>
        <h2>Recovery status</h2>
        {r.active ? (
          <>
            <p className="status-line warn-text">Recovery #{r.requestId} in progress</p>
            <dl className="kv">
              <dt>Proposed owner</dt>
              <dd className="mono">{shortAddr(r.proposedOwner)}</dd>
              <dt>Approvals</dt>
              <dd>{r.approvalCount} of 2 required</dd>
            </dl>
            <CountdownTimer state={state} delay={delay} />
            <p className="muted small">If you did not ask for this, cancel it now. The time-lock exists to give you this window.</p>
            <button className="btn danger" disabled={!!pending} onClick={() => send("cancelRecovery", [], {}, "Cancel recovery")}>
              {pending === "cancelRecovery" ? "Cancelling…" : "Cancel recovery"}
            </button>
          </>
        ) : (
          <p className="status-line ok-text">No recovery in progress. The wallet is under normal owner control.</p>
        )}
      </section>
    </div>
  );
}
