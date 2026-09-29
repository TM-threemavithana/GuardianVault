import { DEMO_ROLES } from "../utils/roles";
import { shortAddr } from "../utils/formatters";

export default function Header({ wallet, roleName }) {
  const { mode, demoIndex, selectDemo, address, hasMetaMask, connectMetaMask } = wallet;
  return (
    <header className="header">
      <div className="brand">
        <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
          <path d="M32 4 8 13v17c0 15 10 26 24 30 14-4 24-15 24-30V13Z" fill="currentColor" />
          <rect x="22" y="28" width="20" height="16" rx="3" fill="var(--bg-primary)" />
          <path d="M26 28v-5a6 6 0 0 1 12 0v5" stroke="var(--bg-primary)" strokeWidth="4" fill="none" />
        </svg>
        <div>
          <h1>GuardianVault</h1>
          <p className="muted small">Smart-contract wallet with 2-of-3 guardian recovery</p>
        </div>
      </div>

      <div className="identity">
        <div className="whoami">
          <span className={`dot ${address ? "on" : ""}`} />
          <span className="mono">{shortAddr(address)}</span>
          <span className="role-tag">{roleName}</span>
          <span className="muted small">{mode === "metamask" ? "via MetaMask" : "demo account"}</span>
        </div>
        <div className="role-switch" role="group" aria-label="Act as">
          <span className="muted small">Act as</span>
          {DEMO_ROLES.map((r) => (
            <button
              key={r.index}
              className={`chip ${mode === "demo" && demoIndex === r.index ? "active" : ""} ${r.key === "attacker" ? "danger" : ""}`}
              onClick={() => selectDemo(r.index)}
            >
              {r.label}
            </button>
          ))}
          {hasMetaMask && (
            <button className={`chip ${mode === "metamask" ? "active" : ""}`} onClick={connectMetaMask}>
              MetaMask
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
