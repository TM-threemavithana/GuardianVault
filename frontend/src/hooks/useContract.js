import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Contract } from "ethers";
import VaultAbi from "../abi/GuardianVault.json";
import SimpleAbi from "../abi/SimpleWallet.json";
import { parseError } from "../utils/formatters";

const EVENT_NAMES = [
  "Deposited",
  "Transferred",
  "RecoveryProposed",
  "RecoveryApproved",
  "RecoveryCancelled",
  "RecoveryExecuted",
  "GuardianReplaced",
];

export function useContract(readProvider, signer, deployment) {
  const vault = useMemo(
    () => (deployment ? new Contract(deployment.guardianVault, VaultAbi, readProvider) : null),
    [deployment, readProvider]
  );
  const simple = useMemo(
    () => (deployment?.simpleWallet ? new Contract(deployment.simpleWallet, SimpleAbi, readProvider) : null),
    [deployment, readProvider]
  );

  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [pending, setPending] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const lastBlock = useRef(-1);

  const refresh = useCallback(async () => {
    if (!vault) return;
    try {
      const code = await readProvider.getCode(deployment.guardianVault);
      if (code === "0x") {
        setLoadError("No contract at the configured address. The node was probably restarted — run scripts/deploy.js again.");
        return;
      }
      const [owner, balance, guardians, r, block] = await Promise.all([
        vault.owner(),
        vault.getBalance(),
        vault.getGuardians(),
        vault.getRecoveryDetails(),
        readProvider.getBlock("latest"),
      ]);
      const approvals = await Promise.all(guardians.map((g) => vault.hasApprovedCurrent(g)));
      let simpleState = null;
      if (simple) {
        const [sOwner, sBal] = await Promise.all([simple.owner(), simple.getBalance()]);
        simpleState = { owner: sOwner, balance: sBal };
      }
      setState({
        owner,
        balance,
        guardians: [...guardians],
        approvals,
        recovery: {
          proposedOwner: r.proposedOwner,
          approvalCount: Number(r.approvalCount),
          executionTime: Number(r.executionTime),
          active: r.active,
          requestId: Number(r.requestId),
        },
        chainTime: block.timestamp,
        blockNumber: block.number,
        fetchedAt: Date.now(),
        simple: simpleState,
      });
      setLoadError(null);
    } catch (e) {
      setLoadError(`Cannot read the contract (${parseError(e)}). Is "npx hardhat node" running?`);
    }
  }, [vault, simple, readProvider, deployment]);

  useEffect(() => {
    if (!vault) return;
    refresh();
    const id = setInterval(async () => {
      try {
        const n = await readProvider.getBlockNumber();
        if (n !== lastBlock.current) {
          lastBlock.current = n;
          refresh();
        }
      } catch {
        /* node offline — refresh() reports it */
      }
    }, 1200);
    return () => clearInterval(id);
  }, [vault, readProvider, refresh]);

  /** Send a state-changing call. Reverts are surfaced as readable reasons, never swallowed. */
  const send = useCallback(
    async (method, args = [], overrides = {}, label = method) => {
      if (!signer || !vault) return false;
      setPending(method);
      try {
        const tx = await vault.connect(signer)[method](...args, overrides);
        const receipt = await tx.wait();
        await refresh();
        setLastResult({ ok: true, label, detail: `Confirmed in block ${receipt.blockNumber} · gas used ${receipt.gasUsed}`, at: Date.now() });
        return true;
      } catch (e) {
        setLastResult({ ok: false, label, detail: parseError(e), at: Date.now() });
        return false;
      } finally {
        setPending(null);
      }
    },
    [signer, vault, refresh]
  );

  const sendToSimple = useCallback(
    async (method, args = [], label = method) => {
      if (!signer || !simple) return;
      setPending(`simple:${method}`);
      try {
        await (await simple.connect(signer)[method](...args)).wait();
        setLastResult({ ok: true, label, detail: "Confirmed", at: Date.now() });
      } catch (e) {
        setLastResult({ ok: false, label, detail: parseError(e), at: Date.now() });
      } finally {
        setPending(null);
        refresh();
      }
    },
    [signer, simple, refresh]
  );

  const fetchHistory = useCallback(async () => {
    if (!vault) return [];
    const from = deployment.deployBlock ?? 0;
    const lists = await Promise.all(EVENT_NAMES.map((n) => vault.queryFilter(vault.filters[n](), from, "latest")));
    const events = lists.flat();
    const times = new Map();
    await Promise.all(
      [...new Set(events.map((e) => e.blockNumber))].map(async (b) => times.set(b, (await readProvider.getBlock(b)).timestamp))
    );
    return events
      .map((e) => ({
        name: e.fragment?.name || e.eventName,
        args: e.args,
        blockNumber: e.blockNumber,
        logIndex: e.index,
        txHash: e.transactionHash,
        timestamp: times.get(e.blockNumber),
      }))
      .sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
  }, [vault, deployment, readProvider]);

  /** Local-dev only: fast-forward chain time, then mine a block to commit it. */
  const advanceTime = useCallback(
    async (seconds) => {
      setPending("advanceTime");
      try {
        await readProvider.send("evm_increaseTime", [seconds]);
        await readProvider.send("evm_mine", []);
        await refresh();
        setLastResult({ ok: true, label: "Advance chain time", detail: `Chain clock moved forward ${seconds / 86400} days and a block was mined`, at: Date.now() });
      } catch (e) {
        setLastResult({ ok: false, label: "Advance chain time", detail: parseError(e), at: Date.now() });
      } finally {
        setPending(null);
      }
    },
    [readProvider, refresh]
  );

  return { state, loadError, pending, lastResult, send, sendToSimple, refresh, fetchHistory, advanceTime };
}
