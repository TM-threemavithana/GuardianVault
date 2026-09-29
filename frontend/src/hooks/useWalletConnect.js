import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserProvider, JsonRpcProvider } from "ethers";

export const RPC_URL = "http://127.0.0.1:8545";
export const LOCAL_CHAIN_ID = 31337;

/**
 * Two ways to sign:
 *  - "demo":     the Hardhat node's unlocked accounts (one click to switch role — ideal for a timed demo)
 *  - "metamask": MetaMask with imported Hardhat accounts (as in the implementation plan)
 * Reads always go straight to the local node so the UI sees evm_mine time-jumps instantly.
 */
export function useWalletConnect() {
  const readProvider = useMemo(
    () => new JsonRpcProvider(RPC_URL, LOCAL_CHAIN_ID, { staticNetwork: true, pollingInterval: 1000 }),
    []
  );
  const [mode, setMode] = useState("demo");
  const [demoIndex, setDemoIndex] = useState(0);
  const [signer, setSigner] = useState(null);
  const [address, setAddress] = useState(null);
  const [error, setError] = useState(null);

  const hasMetaMask = typeof window !== "undefined" && !!window.ethereum;

  useEffect(() => {
    if (mode !== "demo") return;
    let cancelled = false;
    readProvider
      .getSigner(demoIndex)
      .then(async (s) => {
        if (cancelled) return;
        setSigner(s);
        setAddress(await s.getAddress());
        setError(null);
      })
      .catch(() => !cancelled && setError(`Cannot reach the local Hardhat node at ${RPC_URL}. Start it with "npx hardhat node".`));
    return () => {
      cancelled = true;
    };
  }, [mode, demoIndex, readProvider]);

  const connectMetaMask = useCallback(async () => {
    if (!window.ethereum) {
      setError("MetaMask not detected. Use the demo accounts, or install MetaMask.");
      return;
    }
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      try {
        await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x7a69" }] });
      } catch (switchErr) {
        if (switchErr.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x7a69",
              chainName: "Hardhat Local",
              rpcUrls: [RPC_URL],
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            }],
          });
        } else throw switchErr;
      }
      const s = await new BrowserProvider(window.ethereum).getSigner();
      setSigner(s);
      setAddress(await s.getAddress());
      setMode("metamask");
      setError(null);
    } catch (e) {
      setError(e?.message || "MetaMask connection failed");
    }
  }, []);

  useEffect(() => {
    if (mode !== "metamask" || !window.ethereum) return;
    const onAccounts = async (accs) => {
      if (!accs.length) return setMode("demo");
      const s = await new BrowserProvider(window.ethereum).getSigner();
      setSigner(s);
      setAddress(await s.getAddress());
    };
    window.ethereum.on("accountsChanged", onAccounts);
    return () => window.ethereum.removeListener?.("accountsChanged", onAccounts);
  }, [mode]);

  const selectDemo = useCallback((index) => {
    setMode("demo");
    if (index !== undefined) setDemoIndex(index);
  }, []);

  return { readProvider, mode, demoIndex, selectDemo, signer, address, error, hasMetaMask, connectMetaMask };
}
