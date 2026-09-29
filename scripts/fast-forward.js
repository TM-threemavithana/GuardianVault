// Demo helper: advance the local chain by 3 days and mine a block so the
// new timestamp is committed (evm_increaseTime alone does NOT mine).
//   npx hardhat run scripts/fast-forward.js --network localhost
const { network, ethers } = require("hardhat");

async function main() {
  const seconds = Number(process.env.SECONDS || 3 * 24 * 60 * 60);
  const before = (await ethers.provider.getBlock("latest")).timestamp;
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
  const after = (await ethers.provider.getBlock("latest")).timestamp;
  console.log(`Advanced chain time by ${seconds}s`);
  console.log(`  before: ${new Date(before * 1000).toISOString()}`);
  console.log(`  after:  ${new Date(after * 1000).toISOString()}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
