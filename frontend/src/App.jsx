import { useEffect, useState } from "react";
import Header from "./components/Header";
import TabNav from "./components/TabNav";
import OwnerView from "./components/OwnerView";
import GuardianView from "./components/GuardianView";
import RecoveryView from "./components/RecoveryView";
import HistoryView from "./components/HistoryView";
import StatusBar from "./components/StatusBar";
import { useWalletConnect } from "./hooks/useWalletConnect";
import { useContract } from "./hooks/useContract";
import { DEPLOYMENT } from "./utils/contractAddress";
import { describeAddress } from "./utils/roles";

const RECOVERY_DELAY = 3 * 24 * 60 * 60;

function TxResult({ result }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!result) return;
    setVisible(true);
    const id = setTimeout(() => setVisible(false), 9000);
    return () => clearTimeout(id);
  }, [result]);
  if (!result || !visible) return null;
  return (
    <div key={result.at} data-at={result.at} className={`toast ${result.ok ? "ok" : "fail"}`} role="status" aria-live="polite">
      <b>{result.ok ? "✓" : "✕"} {result.label}</b>
      <span>{result.ok ? result.detail : `Reverted: ${result.detail}`}</span>
    </div>
  );
}

export default function App() {
  const wallet = useWalletConnect();
  const c = useContract(wallet.readProvider, wallet.signer, DEPLOYMENT);
  const [tab, setTab] = useState("owner");

  if (!DEPLOYMENT) {
    return (
      <main className="center-screen">
        <div className="card setup">
          <h1>GuardianVault is not deployed yet</h1>
          <ol>
            <li>Terminal 1: <code>npx hardhat node</code></li>
            <li>Terminal 2: <code>npx hardhat run scripts/deploy.js --network localhost</code></li>
            <li>Reload this page.</li>
          </ol>
        </div>
      </main>
    );
  }

  const roleName = describeAddress(wallet.address, c.state);
  const isOwner = c.state && wallet.address?.toLowerCase() === c.state.owner.toLowerCase();
  const props = { c, address: wallet.address, deployment: DEPLOYMENT, delay: RECOVERY_DELAY, isOwner };

  return (
    <div className="app">
      <Header wallet={wallet} roleName={roleName} />
      <TabNav tab={tab} setTab={setTab} recoveryActive={c.state?.recovery.active} />
      <main className="content">
        {(wallet.error || c.loadError) && <p className="notice error">{wallet.error || c.loadError}</p>}
        {!c.state ? (
          !c.loadError && <p className="muted">Reading contract state…</p>
        ) : (
          <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} disabled={!wallet.signer || !!wallet.error}>
            {tab === "owner" && <OwnerView {...props} />}
            {tab === "guardian" && <GuardianView {...props} />}
            {tab === "recovery" && <RecoveryView {...props} />}
            {tab === "history" && <HistoryView {...props} />}
          </fieldset>
        )}
      </main>
      <StatusBar state={c.state} deployment={DEPLOYMENT} />
      <TxResult result={c.lastResult} />
    </div>
  );
}
