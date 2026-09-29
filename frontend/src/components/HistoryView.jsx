import { useEffect, useState } from "react";
import { fmtEth, fmtTime, shortAddr } from "../utils/formatters";

const STYLE = {
  Deposited: { tone: "green", label: "Deposit" },
  Transferred: { tone: "blue", label: "Transfer" },
  RecoveryProposed: { tone: "yellow", label: "Recovery proposed" },
  RecoveryApproved: { tone: "yellow", label: "Recovery approved" },
  RecoveryCancelled: { tone: "red", label: "Recovery cancelled" },
  RecoveryExecuted: { tone: "green", label: "Recovery executed" },
  GuardianReplaced: { tone: "purple", label: "Guardian replaced" },
};

function describe(e) {
  const a = e.args;
  switch (e.name) {
    case "Deposited":
      return `${fmtEth(a.amount)} from ${shortAddr(a.sender)}`;
    case "Transferred":
      return `${fmtEth(a.amount)} to ${shortAddr(a.to)}`;
    case "RecoveryProposed":
      return `#${a.requestId} by ${shortAddr(a.guardian)} for ${shortAddr(a.proposedOwner)}`;
    case "RecoveryApproved":
      return `by ${shortAddr(a.guardian)} · ${a.approvalCount} approvals`;
    case "RecoveryCancelled":
      return `#${a.requestId} by ${shortAddr(a.cancelledBy)}`;
    case "RecoveryExecuted":
      return `${shortAddr(a.oldOwner)} → ${shortAddr(a.newOwner)}`;
    case "GuardianReplaced":
      return `${shortAddr(a.oldGuardian)} → ${shortAddr(a.newGuardian)}`;
    default:
      return "";
  }
}

export default function HistoryView({ c }) {
  const { fetchHistory, state } = c;
  const [events, setEvents] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetchHistory().then(setEvents).catch((e) => setErr(e.message));
  }, [fetchHistory, state?.blockNumber]);

  return (
    <section className="card wide">
      <h2>On-chain event history</h2>
      <p className="muted small">Read directly from contract event logs. Every action is permanent and publicly auditable.</p>
      {err && <p className="notice error">{err}</p>}
      {!events ? (
        <p className="muted">Loading events…</p>
      ) : events.length === 0 ? (
        <p className="muted">No events yet. Deposit ETH from the Owner tab to create the first one.</p>
      ) : (
        <table className="history">
          <thead>
            <tr>
              <th>Event</th>
              <th>Details</th>
              <th>Block</th>
              <th>Chain time</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={`${e.txHash}-${e.logIndex}`}>
                <td>
                  <span className={`badge ${STYLE[e.name]?.tone}`}>{STYLE[e.name]?.label ?? e.name}</span>
                </td>
                <td className="mono small">{describe(e)}</td>
                <td>#{e.blockNumber}</td>
                <td className="small">{fmtTime(e.timestamp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
