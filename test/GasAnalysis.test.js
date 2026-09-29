const hre = require("hardhat");
const { ethers } = hre;
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const fs = require("fs");
const path = require("path");

describe("Gas analysis: GuardianVault vs SimpleWallet", function () {
  it("measures gas for every operation", async function () {
    const [owner, g1, g2, g3, newOwner, , other, g4] = await ethers.getSigners();
    const gas = async (txPromise) => (await (await txPromise).wait()).gasUsed;
    const deployGas = async (c) => (await c.deploymentTransaction().wait()).gasUsed;

    const simple = await (await ethers.getContractFactory("SimpleWallet")).deploy();
    const vault = await (await ethers.getContractFactory("GuardianVault")).deploy([g1.address, g2.address, g3.address]);

    const results = [];
    results.push(["Contract deployment", await deployGas(vault), await deployGas(simple)]);
    results.push([
      "Deposit ETH (receive)",
      await gas(owner.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("5") })),
      await gas(owner.sendTransaction({ to: await simple.getAddress(), value: ethers.parseEther("5") })),
    ]);
    results.push([
      "Transfer ETH (owner)",
      await gas(vault.transfer(other.address, ethers.parseEther("1"))),
      await gas(simple.transfer(other.address, ethers.parseEther("1"))),
    ]);
    results.push(["Propose recovery", await gas(vault.connect(g1).proposeRecovery(newOwner.address)), null]);
    results.push(["Approve recovery", await gas(vault.connect(g2).approveRecovery(newOwner.address)), null]);
    results.push(["Cancel recovery", await gas(vault.cancelRecovery()), null]);
    results.push(["Replace guardian", await gas(vault.replaceGuardian(g3.address, g4.address)), null]);
    // execute path
    await vault.connect(g1).proposeRecovery(newOwner.address);
    await vault.connect(g2).approveRecovery(newOwner.address);
    await time.increase(3 * 24 * 60 * 60);
    results.push(["Execute recovery", await gas(vault.connect(newOwner).executeRecovery()), null]);

    console.log("\n    Operation                 GuardianVault   SimpleWallet   Overhead");
    console.log("    ------------------------  -------------   ------------   --------");
    const out = [];
    for (const [op, gv, sw] of results) {
      const overhead = sw ? `+${(((Number(gv) - Number(sw)) / Number(sw)) * 100).toFixed(1)}%` : "N/A";
      console.log(`    ${op.padEnd(24)}  ${String(gv).padStart(13)}   ${String(sw ?? "N/A").padStart(12)}   ${overhead.padStart(8)}`);
      out.push({ operation: op, guardianVault: Number(gv), simpleWallet: sw ? Number(sw) : null, overhead });
    }
    // Coverage instrumentation inflates gas, so never overwrite the real report during `hardhat coverage`.
    if (hre.__SOLIDITY_COVERAGE_RUNNING) return;
    fs.mkdirSync(path.join(__dirname, "..", "reports"), { recursive: true });
    fs.writeFileSync(path.join(__dirname, "..", "reports", "gas-report.json"), JSON.stringify(out, null, 2));
  });
});
