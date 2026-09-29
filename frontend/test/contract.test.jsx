import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ vault: null }));
vi.mock("ethers", async (original) => ({ ...await original(), Contract: class { constructor() { return f.vault; } } }));
import { useContract, validateSigner } from "../src/hooks/useContract";

const address = "0x1111111111111111111111111111111111111111";
const deployment = { guardianVault: address };
let provider;
beforeEach(() => {
  f.vault = {
    owner: vi.fn(async () => address), getBalance: vi.fn(async () => 5n),
    getGuardians: vi.fn(async () => [address]), hasApprovedCurrent: vi.fn(async () => true),
    getRecoveryDetails: vi.fn(async () => ({ proposedOwner: address, approvalCount: 2n, executionTime: 200n, active: true, requestId: 1n })),
    connect: vi.fn(),
  };
  provider = {
    send: vi.fn(async () => "0x7a69"),
    getBlock: vi.fn(async () => ({ number: 4, timestamp: 100 })),
    getCode: vi.fn(async () => "0x1234"),
  };
});
afterEach(() => vi.useRealTimers());

describe("Contract connectivity", () => {
  it("clears stale state on failure and retries successfully at the same block height", async () => {
    const { result } = renderHook(() => useContract(provider, null, deployment));
    await waitFor(() => expect(result.current.state?.balance).toBe(5n));
    vi.useFakeTimers();
    provider.getBlock.mockRejectedValue(new Error("offline"));
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); await result.current.refresh(); });
    expect(result.current.state).toBeNull();
    expect(result.current.loadError).toContain("offline");
    provider.getBlock.mockResolvedValue({ number: 4, timestamp: 100 });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); await result.current.refresh(); });
    expect(result.current.state?.balance).toBe(5n);
    expect(result.current.loadError).toBeNull();
  });

  it("clears old data when a node restarts without a deployment", async () => {
    const { result } = renderHook(() => useContract(provider, null, deployment));
    await waitFor(() => expect(result.current.state).not.toBeNull());
    provider.getCode.mockResolvedValue("0x");
    await act(async () => result.current.refresh());
    expect(result.current.state).toBeNull();
    expect(result.current.loadError).toContain("Redeploy");
  });

  it("reads balances and recovery state at the same block as the countdown", async () => {
    const { result } = renderHook(() => useContract(provider, null, deployment));
    await waitFor(() => expect(result.current.state?.chainTime).toBe(100));
    expect(f.vault.owner).toHaveBeenCalledWith({ blockTag: 4 });
    expect(f.vault.getRecoveryDetails).toHaveBeenCalledWith({ blockTag: 4 });
  });

  it("rejects missing wallets, wrong-chain wallets, and revoked accounts before signing", async () => {
    await expect(validateSigner(null)).rejects.toThrow("Connect a wallet");
    const signer = { getAddress: async () => address, provider: { send: vi.fn(async () => "0x1") } };
    await expect(validateSigner(signer)).rejects.toThrow("Wrong network");
    signer.provider.send.mockImplementation(async (method) => method === "eth_chainId" ? "0x7a69" : []);
    await expect(validateSigner(signer)).rejects.toThrow("Wallet account changed");
  });
});
