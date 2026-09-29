const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const THREE_DAYS = 3 * 24 * 60 * 60;

describe("GuardianVault", function () {
  async function deployFixture() {
    const [owner, g1, g2, g3, newOwner, attacker, other, g4] = await ethers.getSigners();
    const Vault = await ethers.getContractFactory("GuardianVault");
    const vault = await Vault.deploy([g1.address, g2.address, g3.address]);
    await vault.waitForDeployment();
    await owner.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("5") });
    return { vault, owner, g1, g2, g3, newOwner, attacker, other, g4 };
  }

  async function thresholdMetFixture() {
    const f = await deployFixture();
    await f.vault.connect(f.g1).proposeRecovery(f.newOwner.address);
    await f.vault.connect(f.g2).approveRecovery(f.newOwner.address);
    return f;
  }

  describe("Deployment", function () {
    it("sets owner, guardians and constants", async function () {
      const { vault, owner, g1, g2, g3 } = await loadFixture(deployFixture);
      expect(await vault.owner()).to.equal(owner.address);
      expect(await vault.getGuardians()).to.deep.equal([g1.address, g2.address, g3.address]);
      expect(await vault.REQUIRED_APPROVALS()).to.equal(2n);
      expect(await vault.RECOVERY_DELAY()).to.equal(BigInt(THREE_DAYS));
      expect(await vault.getBalance()).to.equal(ethers.parseEther("5"));
    });

    it("rejects zero-address, duplicate, and owner-as-guardian configurations", async function () {
      const [owner, g1, g2] = await ethers.getSigners();
      const Vault = await ethers.getContractFactory("GuardianVault");
      await expect(Vault.deploy([g1.address, g2.address, ethers.ZeroAddress]))
        .to.be.revertedWith("Guardian cannot be zero address");
      await expect(Vault.deploy([g1.address, g1.address, g2.address]))
        .to.be.revertedWith("Guardians must be unique");
      await expect(Vault.deploy([owner.address, g1.address, g2.address]))
        .to.be.revertedWith("Owner cannot be a guardian");
    });
  });

  describe("Security defence tests (plan section 5.1)", function () {
    it("Test 1: outsider cannot transfer funds", async function () {
      const { vault, attacker } = await loadFixture(deployFixture);
      await expect(vault.connect(attacker).transfer(attacker.address, ethers.parseEther("1")))
        .to.be.revertedWith("Not the owner");
    });

    it("Test 2: outsider cannot propose recovery", async function () {
      const { vault, attacker } = await loadFixture(deployFixture);
      await expect(vault.connect(attacker).proposeRecovery(attacker.address))
        .to.be.revertedWith("Not a guardian");
    });

    it("Test 3: one guardian cannot meet the threshold", async function () {
      const { vault, g1, newOwner } = await loadFixture(deployFixture);
      await vault.connect(g1).proposeRecovery(newOwner.address);
      await time.increase(THREE_DAYS * 10);
      await expect(vault.connect(newOwner).executeRecovery())
        .to.be.revertedWith("Approval threshold not met");
    });

    it("Test 4: same guardian cannot approve twice", async function () {
      const { vault, g1, newOwner } = await loadFixture(deployFixture);
      await vault.connect(g1).proposeRecovery(newOwner.address);
      await expect(vault.connect(g1).approveRecovery(newOwner.address))
        .to.be.revertedWith("Already approved this request");
    });

    it("Test 5: recovery cannot execute before the 3-day waiting period", async function () {
      const { vault, newOwner } = await loadFixture(thresholdMetFixture);
      await expect(vault.connect(newOwner).executeRecovery())
        .to.be.revertedWith("Waiting period not elapsed");
      await time.increase(THREE_DAYS - 10); // still 1 block-second short
      await expect(vault.connect(newOwner).executeRecovery())
        .to.be.revertedWith("Waiting period not elapsed");
    });

    it("Test 6: owner can cancel an active recovery", async function () {
      const { vault, owner, g3, newOwner } = await loadFixture(thresholdMetFixture);
      await expect(vault.connect(owner).cancelRecovery())
        .to.emit(vault, "RecoveryCancelled").withArgs(owner.address, 1n);
      const r = await vault.getRecoveryDetails();
      expect(r.active).to.equal(false);
      await time.increase(THREE_DAYS);
      await expect(vault.connect(newOwner).executeRecovery()).to.be.revertedWith("No active recovery");
      // A new request starts fresh
      await vault.connect(g3).proposeRecovery(newOwner.address);
      const r2 = await vault.getRecoveryDetails();
      expect(r2.approvalCount).to.equal(1n);
      expect(r2.executionTime).to.equal(0n);
      expect(r2.requestId).to.equal(2n);
    });

    it("Test 7: cancelled approvals cannot be replayed on a new request", async function () {
      const { vault, owner, g2, g3, newOwner } = await loadFixture(thresholdMetFixture);
      await vault.connect(owner).cancelRecovery();
      await vault.connect(g3).proposeRecovery(newOwner.address); // request #2
      expect(await vault.hasApprovedCurrent(g2.address)).to.equal(false);
      expect((await vault.getRecoveryDetails()).approvalCount).to.equal(1n);
      // G2 must explicitly approve again; old approval (request #1) does not count
      await vault.connect(g2).approveRecovery(newOwner.address);
      expect((await vault.getRecoveryDetails()).approvalCount).to.equal(2n);
    });
  });

  describe("Functional test", function () {
    it("Test 8: full successful recovery transfers ownership", async function () {
      const { vault, owner, g1, g2, newOwner, other } = await loadFixture(deployFixture);
      await expect(vault.connect(g1).proposeRecovery(newOwner.address))
        .to.emit(vault, "RecoveryProposed").withArgs(g1.address, newOwner.address, 1n);
      await expect(vault.connect(g2).approveRecovery(newOwner.address))
        .to.emit(vault, "RecoveryApproved").withArgs(g2.address, newOwner.address, 2n);

      await time.increase(THREE_DAYS);
      await expect(vault.connect(newOwner).executeRecovery())
        .to.emit(vault, "RecoveryExecuted").withArgs(owner.address, newOwner.address);
      expect(await vault.owner()).to.equal(newOwner.address);

      await expect(vault.connect(newOwner).transfer(other.address, ethers.parseEther("1")))
        .to.changeEtherBalances([vault, other], [ethers.parseEther("-1"), ethers.parseEther("1")]);
      await expect(vault.connect(owner).transfer(other.address, ethers.parseEther("1")))
        .to.be.revertedWith("Not the owner");
    });
  });

  describe("Edge cases (plan section 5.2)", function () {
    it("cannot propose the zero address", async function () {
      const { vault, g1 } = await loadFixture(deployFixture);
      await expect(vault.connect(g1).proposeRecovery(ethers.ZeroAddress))
        .to.be.revertedWith("New owner cannot be zero address");
    });

    it("cannot propose the current owner", async function () {
      const { vault, g1, owner } = await loadFixture(deployFixture);
      await expect(vault.connect(g1).proposeRecovery(owner.address))
        .to.be.revertedWith("New owner is already the owner");
    });

    it("cannot propose a guardian as the new owner", async function () {
      const { vault, g1, g2 } = await loadFixture(deployFixture);
      await expect(vault.connect(g1).proposeRecovery(g2.address))
        .to.be.revertedWith("New owner cannot be a guardian");
    });

    it("cannot propose while a recovery is already active", async function () {
      const { vault, g1, g2, newOwner, other } = await loadFixture(deployFixture);
      await vault.connect(g1).proposeRecovery(newOwner.address);
      await expect(vault.connect(g2).proposeRecovery(other.address))
        .to.be.revertedWith("Recovery already active");
    });

    it("cannot approve a different proposed owner", async function () {
      const { vault, g1, g2, newOwner, attacker } = await loadFixture(deployFixture);
      await vault.connect(g1).proposeRecovery(newOwner.address);
      await expect(vault.connect(g2).approveRecovery(attacker.address))
        .to.be.revertedWith("Proposed owner mismatch");
    });

    it("only the proposed owner can execute", async function () {
      const { vault, attacker, g1 } = await loadFixture(thresholdMetFixture);
      await time.increase(THREE_DAYS);
      await expect(vault.connect(attacker).executeRecovery()).to.be.revertedWith("Not the proposed owner");
      await expect(vault.connect(g1).executeRecovery()).to.be.revertedWith("Not the proposed owner");
    });

    it("cannot cancel when no recovery is active", async function () {
      const { vault, owner } = await loadFixture(deployFixture);
      await expect(vault.connect(owner).cancelRecovery()).to.be.revertedWith("No active recovery");
    });

    it("non-owner cannot cancel a recovery", async function () {
      const { vault, g3 } = await loadFixture(thresholdMetFixture);
      await expect(vault.connect(g3).cancelRecovery()).to.be.revertedWith("Not the owner");
    });

    it("deposits work from any address (receive and deposit)", async function () {
      const { vault, attacker, other } = await loadFixture(deployFixture);
      const addr = await vault.getAddress();
      await expect(attacker.sendTransaction({ to: addr, value: ethers.parseEther("1") }))
        .to.emit(vault, "Deposited").withArgs(attacker.address, ethers.parseEther("1"));
      await expect(vault.connect(other).deposit({ value: ethers.parseEther("2") }))
        .to.emit(vault, "Deposited").withArgs(other.address, ethers.parseEther("2"));
      expect(await vault.getBalance()).to.equal(ethers.parseEther("8"));
      await expect(vault.connect(other).deposit({ value: 0 })).to.be.revertedWith("Must send ETH");
    });

    it("transfer input validation (zero address, zero amount, overdraw)", async function () {
      const { vault, owner, other } = await loadFixture(deployFixture);
      await expect(vault.connect(owner).transfer(ethers.ZeroAddress, 1n))
        .to.be.revertedWith("Cannot transfer to zero address");
      await expect(vault.connect(owner).transfer(other.address, 0n))
        .to.be.revertedWith("Amount must be greater than zero");
      await expect(vault.connect(owner).transfer(other.address, ethers.parseEther("6")))
        .to.be.revertedWith("Insufficient balance");
    });

    it("replacing a guardian auto-cancels an active recovery", async function () {
      const { vault, owner, g2, g4, newOwner } = await loadFixture(thresholdMetFixture);
      await expect(vault.connect(owner).replaceGuardian(g2.address, g4.address))
        .to.emit(vault, "RecoveryCancelled").withArgs(owner.address, 1n)
        .and.to.emit(vault, "GuardianReplaced").withArgs(g2.address, g4.address);
      expect((await vault.getRecoveryDetails()).active).to.equal(false);
      expect(await vault.isGuardian(g2.address)).to.equal(false);
      expect(await vault.isGuardian(g4.address)).to.equal(true);
      expect((await vault.getGuardians())[1]).to.equal(g4.address);
      await time.increase(THREE_DAYS);
      await expect(vault.connect(newOwner).executeRecovery()).to.be.revertedWith("No active recovery");
    });

    it("cannot replace a non-existent guardian or add an invalid one", async function () {
      const { vault, owner, g1, g2, other, g4, attacker } = await loadFixture(deployFixture);
      await expect(vault.connect(owner).replaceGuardian(other.address, g4.address))
        .to.be.revertedWith("Old address is not a guardian");
      await expect(vault.connect(owner).replaceGuardian(g1.address, ethers.ZeroAddress))
        .to.be.revertedWith("New guardian cannot be zero address");
      await expect(vault.connect(owner).replaceGuardian(g1.address, owner.address))
        .to.be.revertedWith("Owner cannot be a guardian");
      await expect(vault.connect(owner).replaceGuardian(g1.address, g2.address))
        .to.be.revertedWith("Already a guardian");
      await expect(vault.connect(attacker).replaceGuardian(g1.address, attacker.address))
        .to.be.revertedWith("Not the owner");
    });

    it("a replaced guardian can no longer approve", async function () {
      const { vault, owner, g1, g2, g4, newOwner } = await loadFixture(deployFixture);
      await vault.connect(owner).replaceGuardian(g2.address, g4.address);
      await vault.connect(g1).proposeRecovery(newOwner.address);
      await expect(vault.connect(g2).approveRecovery(newOwner.address)).to.be.revertedWith("Not a guardian");
      await vault.connect(g4).approveRecovery(newOwner.address); // new guardian works
      expect((await vault.getRecoveryDetails()).approvalCount).to.equal(2n);
    });

    it("a third approval does not reset the time-lock", async function () {
      const { vault, g3, newOwner } = await loadFixture(thresholdMetFixture);
      const before = (await vault.getRecoveryDetails()).executionTime;
      await time.increase(3600);
      await vault.connect(g3).approveRecovery(newOwner.address);
      const r = await vault.getRecoveryDetails();
      expect(r.approvalCount).to.equal(3n);
      expect(r.executionTime).to.equal(before);
    });
  });

  describe("Comparison: SimpleWallet vs GuardianVault (plan section 5.3)", function () {
    it("plain wallet funds are locked forever after key loss; GuardianVault recovers them", async function () {
      const [owner, g1, g2, g3, newOwner, , other] = await ethers.getSigners();

      const simple = await (await ethers.getContractFactory("SimpleWallet")).deploy();
      await owner.sendTransaction({ to: await simple.getAddress(), value: ethers.parseEther("5") });
      // Owner key "lost": nobody else can move funds and no owner-change function exists
      await expect(simple.connect(newOwner).transfer(newOwner.address, ethers.parseEther("5")))
        .to.be.revertedWith("Not the owner");
      expect(simple.interface.fragments.some((f) => f.name && /owner/i.test(f.name) && f.type === "function" && f.name !== "owner"))
        .to.equal(false);
      expect(await simple.getBalance()).to.equal(ethers.parseEther("5"));

      const vault = await (await ethers.getContractFactory("GuardianVault")).deploy([g1.address, g2.address, g3.address]);
      await owner.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("5") });
      await vault.connect(g1).proposeRecovery(newOwner.address);
      await vault.connect(g2).approveRecovery(newOwner.address);
      await time.increase(THREE_DAYS);
      await vault.connect(newOwner).executeRecovery();
      await expect(vault.connect(newOwner).transfer(other.address, ethers.parseEther("5")))
        .to.changeEtherBalance(other, ethers.parseEther("5"));
      expect(await vault.getBalance()).to.equal(0n);
    });
  });
});
