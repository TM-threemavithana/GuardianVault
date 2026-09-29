import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserProvider, FetchRequest, JsonRpcProvider } from "ethers";

export const RPC_URL = "http://127.0.0.1:8545";
export const LOCAL_CHAIN_ID = 31337;

export function useWalletConnect() {
  const readProvider = useMemo(() => {
    const request = new FetchRequest(RPC_URL);
    request.timeout = 4000;
    return new JsonRpcProvider(request, LOCAL_CHAIN_ID, { staticNetwork: true, pollingInterval: 1000, cacheTimeout: -1 });
  }, []);
  const [mode, setMode] = useState("demo");
  const [demoIndex, setDemoIndex] = useState(0);
  const [revision, setRevision] = useState(0);
  const [signer, setSigner] = useState(null);
  const [address, setAddress] = useState(null);
  const [error, setError] = useState(null);
  const generation = useRef(0);
  const connectionIntent = useRef(0);
  const hasMetaMask = typeof window !== "undefined" && !!window.ethereum;

  const invalidate = useCallback(() => {
    generation.current++;
    setSigner(null);
    setAddress(null);
  }, []);

  useEffect(() => {
    const injected = window.ethereum;
    let disposed = false;
    let retry;
    const sync = async () => {
      invalidate();
      const ticket = generation.current;
      try {
        let nextSigner;
        if (mode === "metamask") {
          if (!injected) throw new Error("MetaMask not detected.");
          const chainId = await injected.request({ method: "eth_chainId" });
          if (Number(chainId) !== LOCAL_CHAIN_ID) throw new Error("Wrong network. Switch MetaMask to Hardhat Local (31337).");
          const accounts = await injected.request({ method: "eth_accounts" });
          if (!accounts.length) throw new Error("MetaMask disconnected. Connect an account to continue.");
          nextSigner = await new BrowserProvider(injected).getSigner(accounts[0]);
        } else {
          if (Number(await readProvider.send("eth_chainId", [])) !== LOCAL_CHAIN_ID) throw new Error("Local node must use chain ID 31337.");
          nextSigner = await readProvider.getSigner(demoIndex);
        }
        const nextAddress = await nextSigner.getAddress();
        if (disposed || ticket !== generation.current) return;
        setSigner(nextSigner);
        setAddress(nextAddress);
        setError(null);
      } catch (e) {
        if (disposed || ticket !== generation.current) return;
        setError(mode === "demo" ? `Cannot connect to Hardhat Local: ${e.message}` : e.message);
        if (mode === "demo") retry = setTimeout(sync, 2000);
      }
    };
    const disconnected = () => {
      invalidate();
      setError("MetaMask disconnected. Reconnect before sending a transaction.");
    };
    sync();
    if (mode === "metamask") {
      injected?.on("accountsChanged", sync);
      injected?.on("chainChanged", sync);
      injected?.on("connect", sync);
      injected?.on("disconnect", disconnected);
    }
    return () => {
      disposed = true;
      generation.current++;
      clearTimeout(retry);
      for (const event of ["accountsChanged", "chainChanged", "connect"]) injected?.removeListener?.(event, sync);
      injected?.removeListener?.("disconnect", disconnected);
    };
  }, [mode, demoIndex, revision, readProvider, invalidate]);

  const connectMetaMask = useCallback(async () => {
    const intent = ++connectionIntent.current;
    invalidate();
    setMode("metamask");
    if (!window.ethereum) {
      setError("MetaMask not detected. Use demo accounts or install MetaMask.");
      return;
    }
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      if (intent !== connectionIntent.current) return;
      try {
        await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x7a69" }] });
      } catch (e) {
        if (e.code !== 4902) throw e;
        await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{
          chainId: "0x7a69", chainName: "Hardhat Local", rpcUrls: [RPC_URL],
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        }] });
        await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x7a69" }] });
      }
      if (intent === connectionIntent.current) setRevision((value) => value + 1);
    } catch (e) {
      if (intent !== connectionIntent.current) return;
      invalidate();
      setError(e.message || "MetaMask connection failed");
    }
  }, [invalidate]);

  const selectDemo = useCallback((index) => {
    connectionIntent.current++;
    invalidate();
    setMode("demo");
    if (index !== undefined) setDemoIndex(index);
    setRevision((value) => value + 1);
  }, [invalidate]);

  return { readProvider, mode, demoIndex, selectDemo, signer, address, error, hasMetaMask, connectMetaMask };
}
