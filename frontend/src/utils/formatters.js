import { formatEther } from "ethers";

export const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

export const fmtEth = (wei, digits = 4) => {
  if (wei === undefined || wei === null) return "—";
  const n = Number(formatEther(wei));
  return `${n.toLocaleString(undefined, { maximumFractionDigits: digits })} ETH`;
};

export function fmtDuration(seconds) {
  if (seconds <= 0) return "0s";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export const fmtTime = (ts) =>
  ts ? new Date(Number(ts) * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

/** Pull the human revert reason out of an ethers v6 / MetaMask error. */
export function parseError(e) {
  if (!e) return "Unknown error";
  if (e.code === "ACTION_REJECTED" || e?.info?.error?.code === 4001) return "Rejected in wallet";
  const candidates = [
    e.reason,
    e.revert?.args?.[0],
    e.info?.error?.data?.message,
    e.info?.error?.message,
    e.error?.data?.message,
    e.error?.message,
    e.data?.message,
    e.shortMessage,
    e.message,
  ].filter(Boolean);
  for (const msg of candidates) {
    const m =
      /reverted with reason string ['"]([^'"]+)['"]/.exec(msg) ||
      /execution reverted:?\s*["']?([^"'\n]+?)["']?\s*$/.exec(msg);
    if (m) return m[1];
  }
  if (e.code === "INVALID_ARGUMENT") return "Invalid input — check the address and amount";
  return candidates[0] || String(e);
}
