const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("SimpleWallet (baseline, no recovery)", function () {
  async function deployFixture() {
    const [owner, attacker, other] = await ethers.getSigners();
    const wallet = await (await ethers.getContractFactory("SimpleWallet")).deploy();
    await owner.sendTransaction({ to: await wallet.getAddress(), value: ethers.parseEther("5") });
    return { wallet, owner, attacker, other };
  }

  it("accepts deposits", async function () {
    const { wallet } = await loadFixture(deployFixture);
    expect(await wallet.getBalance()).to.equal(ethers.parseEther("5"));
  });

  it("accepts explicit deposit() and rejects zero deposits", async function () {
    const { wallet, other } = await loadFixture(deployFixture);
    await expect(wallet.connect(other).deposit({ value: ethers.parseEther("1") }))
      .to.emit(wallet, "Deposited").withArgs(other.address, ethers.parseEther("1"));
    await expect(wallet.connect(other).deposit({ value: 0 })).to.be.revertedWith("Must send ETH");
  });

  it("rejects invalid transfers", async function () {
    const { wallet, owner, other } = await loadFixture(deployFixture);
    await expect(wallet.connect(owner).transfer(ethers.ZeroAddress, 1n)).to.be.revertedWith("Cannot transfer to zero address");
    await expect(wallet.connect(owner).transfer(other.address, ethers.parseEther("9"))).to.be.revertedWith("Invalid amount");
  });

  it("lets the owner transfer", async function () {
    const { wallet, owner, other } = await loadFixture(deployFixture);
    await expect(wallet.connect(owner).transfer(other.address, ethers.parseEther("1")))
      .to.changeEtherBalance(other, ethers.parseEther("1"));
  });

  it("blocks non-owners from transferring", async function () {
    const { wallet, attacker } = await loadFixture(deployFixture);
    await expect(wallet.connect(attacker).transfer(attacker.address, 1n)).to.be.revertedWith("Not the owner");
  });
});
