import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Contract } from "ethers";
import VaultAbi from "../abi/GuardianVault.json";
import SimpleAbi from "../abi/SimpleWallet.json";
import { parseError } from "../utils/formatters";
import { LOCAL_CHAIN_ID } from "./useWalletConnect";

export async function validateSigner(signer) {
  if (!signer) throw new Error("Connect a wallet before sending a transaction.");
  const chainId = await signer.provider.send("eth_chainId", []);
  if (Number(chainId) !== LOCAL_CHAIN_ID) throw new Error("Wrong network. Switch to Hardhat Local (31337).");
  const accounts = await signer.provider.send("eth_accounts", []);
  const address = await signer.getAddress();
  if (!accounts.some((account) => account.toLowerCase() === address.toLowerCase())) {
    throw new Error("Wallet account changed. Reconnect before sending a transaction.");
  }
}

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
  const generation = useRef(0);
  const inFlight = useRef(null);

  const refresh = useCallback(() => {
    if (!vault) return Promise.resolve(false);
    if (inFlight.current) return inFlight.current;
    const ticket = generation.current;
    const task = (async () => {
      try {
        if (Number(await readProvider.send("eth_chainId", [])) !== LOCAL_CHAIN_ID) throw new Error("Expected local chain ID 31337");
        const block = await readProvider.getBlock("latest");
        if (!block) throw new Error("Latest block is unavailable");
        const atBlock = { blockTag: block.number };
        const code = await readProvider.getCode(deployment.guardianVault, block.number);
        if (code === "0x") {
          throw new Error("No contract at the configured address. Redeploy after restarting the node.");
        }
        const [owner, balance, guardians, r] = await Promise.all([
          vault.owner(atBlock),
          vault.getBalance(atBlock),
          vault.getGuardians(atBlock),
          vault.getRecoveryDetails(atBlock),
        ]);
        const approvals = await Promise.all(guardians.map((g) => vault.hasApprovedCurrent(g, atBlock)));
        let simpleState = null;
        if (simple) {
          const [sOwner, sBal] = await Promise.all([simple.owner(atBlock), simple.getBalance(atBlock)]);
          simpleState = { owner: sOwner, balance: sBal };
        }
        if (ticket !== generation.current) return false;
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
          simple: simpleState,
        });
        setLoadError(null);
        return true;
      } catch (e) {
        if (ticket !== generation.current) return false;
        setState(null);
        setLoadError(`Cannot read the contract (${parseError(e)}). Is "npx hardhat node" running?`);
        return false;
      }
    })();
    inFlight.current = task;
    task.finally(() => { if (inFlight.current === task) inFlight.current = null; });
    return task;
  }, [vault, simple, readProvider, deployment]);

  useEffect(() => {
    if (!vault) return;
    generation.current++;
    inFlight.current = null;
    setState(null);
    refresh();
    // Retry even at the same height: a node can disconnect or reset without a new block.
    const id = setInterval(refresh, 1500);
    return () => {
      clearInterval(id);
      generation.current++;
      inFlight.current = null;
    };
  }, [vault, readProvider, refresh]);

  /** Send a state-changing call. Reverts are surfaced as readable reasons, never swallowed. */
  const send = useCallback(
    async (method, args = [], overrides = {}, label = method) => {
      setPending(method);
      try {
        if (!vault || !state || loadError) throw new Error("Contract state unavailable. Wait for reconnection.");
        await validateSigner(signer);
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
    [signer, vault, refresh, state, loadError]
  );

  const sendToSimple = useCallback(
    async (method, args = [], label = method) => {
      setPending(`simple:${method}`);
      try {
        if (!simple || !state || loadError) throw new Error("Contract state unavailable. Wait for reconnection.");
        await validateSigner(signer);
        await (await simple.connect(signer)[method](...args)).wait();
        setLastResult({ ok: true, label, detail: "Confirmed", at: Date.now() });
      } catch (e) {
        setLastResult({ ok: false, label, detail: parseError(e), at: Date.now() });
      } finally {
        setPending(null);
        refresh();
      }
    },
    [signer, simple, refresh, state, loadError]
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
