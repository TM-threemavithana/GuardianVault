import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  chain: "0x7a69", accounts: ["0x1111111111111111111111111111111111111111"],
  localSigner: { getAddress: async () => "0x2222222222222222222222222222222222222222" },
  browserSigner: null,
}));
vi.mock("ethers", async (original) => ({
  ...await original(),
  JsonRpcProvider: class {
    send = async () => "0x7a69";
    getSigner = async () => f.localSigner;
  },
  BrowserProvider: class {
    getSigner = async (address) => f.browserSigner ? f.browserSigner() : { getAddress: async () => address };
  },
}));
import { useWalletConnect } from "../src/hooks/useWalletConnect";

let listeners;
beforeEach(() => {
  f.chain = "0x7a69";
  f.accounts = ["0x1111111111111111111111111111111111111111"];
  f.browserSigner = null;
  listeners = new Map();
  window.ethereum = {
    request: vi.fn(async ({ method }) => {
      if (method === "eth_chainId") return f.chain;
      if (["eth_accounts", "eth_requestAccounts"].includes(method)) return f.accounts;
    }),
    on: (event, fn) => listeners.set(event, fn),
    removeListener: (event, fn) => { if (listeners.get(event) === fn) listeners.delete(event); },
  };
});
async function connect(result) {
  await act(async () => result.current.connectMetaMask());
  await waitFor(() => expect(result.current.address).to.equal(f.accounts[0]));
}

describe("Wallet lifecycle", () => {
  it("invalidates the signer on a chain change and reconnects only on the local chain", async () => {
    const { result } = renderHook(useWalletConnect);
    await connect(result);
    f.chain = "0x1";
    await act(async () => listeners.get("chainChanged")(f.chain));
    expect(result.current.signer).toBeNull();
    expect(result.current.address).toBeNull();
    expect(result.current.error).toContain("Wrong network");
    f.chain = "0x7a69";
    await act(async () => listeners.get("chainChanged")(f.chain));
    await waitFor(() => expect(result.current.signer).not.toBeNull());
    expect(result.current.error).toBeNull();
  });

  it("handles changed accounts and an empty account list without falling back to demo signing", async () => {
    const { result } = renderHook(useWalletConnect);
    await connect(result);
    f.accounts = ["0x3333333333333333333333333333333333333333"];
    await act(async () => listeners.get("accountsChanged")(f.accounts));
    await waitFor(() => expect(result.current.address).toBe(f.accounts[0]));
    f.accounts = [];
    await act(async () => listeners.get("accountsChanged")([]));
    expect(result.current.signer).toBeNull();
    expect(result.current.mode).toBe("metamask");
    expect(result.current.error).toContain("disconnected");
  });

  it("clears the signer on disconnect and removes all listeners on unmount", async () => {
    const { result, unmount } = renderHook(useWalletConnect);
    await connect(result);
    act(() => listeners.get("disconnect")());
    expect(result.current.signer).toBeNull();
    unmount();
    expect(listeners.size).toBe(0);
  });

  it("does not restore a stale async signer after switching to the wrong chain", async () => {
    const { result } = renderHook(useWalletConnect);
    await connect(result);
    let resolve;
    f.browserSigner = () => new Promise((done) => { resolve = done; });
    act(() => { listeners.get("accountsChanged")(f.accounts); });
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    f.chain = "0x1";
    await act(async () => listeners.get("chainChanged")(f.chain));
    await act(async () => resolve({ getAddress: async () => f.accounts[0] }));
    expect(result.current.signer).toBeNull();
    expect(result.current.error).toContain("Wrong network");
  });

  it("ignores a rejected MetaMask prompt after the user has returned to demo mode", async () => {
    const { result } = renderHook(useWalletConnect);
    await waitFor(() => expect(result.current.signer).not.toBeNull());
    const request = window.ethereum.request.getMockImplementation();
    let reject;
    window.ethereum.request.mockImplementation((args) => args.method === "eth_requestAccounts"
      ? new Promise((_, fail) => { reject = fail; }) : request(args));
    let connection;
    act(() => { connection = result.current.connectMetaMask(); });
    act(() => result.current.selectDemo(0));
    await waitFor(() => expect(result.current.mode).toBe("demo"));
    await act(async () => { reject(new Error("Rejected")); await connection; });
    await waitFor(() => expect(result.current.signer).not.toBeNull());
    expect(result.current.error).toBeNull();
  });
});
