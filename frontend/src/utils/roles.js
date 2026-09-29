// Hardhat's default accounts 0..5 (see Implementation_Plan.md §2 Account Roles)
export const DEMO_ROLES = [
  { index: 0, key: "owner", label: "Owner" },
  { index: 1, key: "guardian1", label: "Guardian 1" },
  { index: 2, key: "guardian2", label: "Guardian 2" },
  { index: 3, key: "guardian3", label: "Guardian 3" },
  { index: 4, key: "newOwner", label: "New Owner" },
  { index: 5, key: "attacker", label: "Attacker" },
];

/** Describe an address relative to the live contract state. */
export function describeAddress(addr, state) {
  if (!addr) return "Unknown";
  const a = addr.toLowerCase();
  if (state?.owner && a === state.owner.toLowerCase()) return "Current owner";
  const gi = state?.guardians?.findIndex((g) => g.toLowerCase() === a) ?? -1;
  if (gi >= 0) return `Guardian ${gi + 1}`;
  if (state?.recovery?.active && a === state.recovery.proposedOwner.toLowerCase()) return "Proposed owner";
  return "No role in this vault";
}
