import { fmtEth, fmtTime, shortAddr } from "../utils/formatters";

export default function StatusBar({ state, deployment }) {
  return (
    <footer className="statusbar">
      <span>Owner <b className="mono">{shortAddr(state?.owner)}</b></span>
      <span>Balance <b>{fmtEth(state?.balance)}</b></span>
      <span>Block <b>#{state?.blockNumber ?? "—"}</b></span>
      <span>Chain time <b>{fmtTime(state?.chainTime)}</b></span>
      <span className="muted">Contract <span className="mono">{shortAddr(deployment?.guardianVault)}</span> · Hardhat 31337</span>
    </footer>
  );
}
