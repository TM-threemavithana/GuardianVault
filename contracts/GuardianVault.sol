// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GuardianVault
/// @notice Smart-contract wallet with 2-of-3 guardian-assisted recovery and a 3-day time-lock.
/// @dev EC8204 Blockchain & Cyber Security group project.
contract GuardianVault {
    // ── Core State ──
    address public owner;
    uint256 public constant REQUIRED_APPROVALS = 2;
    uint256 public constant RECOVERY_DELAY = 3 days;

    // ── Guardian Management ──
    address[3] public guardians;
    mapping(address => bool) public isGuardian;

    // ── Recovery State ──
    struct RecoveryRequest {
        address proposedOwner;
        uint256 approvalCount;
        uint256 executionTime; // 0 until the approval threshold is met
        bool active;
        uint256 requestId;
    }

    RecoveryRequest public recoveryRequest;
    uint256 public currentRequestId;

    /// @dev guardian => the last requestId that guardian approved (anti-replay)
    mapping(address => uint256) public guardianApprovedRequestId;

    // ── Events ──
    event Deposited(address indexed sender, uint256 amount);
    event Transferred(address indexed to, uint256 amount);
    event RecoveryProposed(address indexed guardian, address indexed proposedOwner, uint256 requestId);
    event RecoveryApproved(address indexed guardian, address indexed proposedOwner, uint256 approvalCount);
    event RecoveryCancelled(address indexed cancelledBy, uint256 requestId);
    event RecoveryExecuted(address indexed oldOwner, address indexed newOwner);
    event GuardianReplaced(address indexed oldGuardian, address indexed newGuardian);
    event GuardianVaultDeployed(address indexed owner, address[3] guardians);

    // ── Modifiers ──
    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }

    modifier onlyGuardian() {
        require(isGuardian[msg.sender], "Not a guardian");
        _;
    }

    constructor(address[3] memory _guardians) {
        require(
            _guardians[0] != address(0) && _guardians[1] != address(0) && _guardians[2] != address(0),
            "Guardian cannot be zero address"
        );
        require(
            _guardians[0] != _guardians[1] && _guardians[1] != _guardians[2] && _guardians[0] != _guardians[2],
            "Guardians must be unique"
        );
        require(
            msg.sender != _guardians[0] && msg.sender != _guardians[1] && msg.sender != _guardians[2],
            "Owner cannot be a guardian"
        );

        owner = msg.sender;
        guardians = _guardians;
        isGuardian[_guardians[0]] = true;
        isGuardian[_guardians[1]] = true;
        isGuardian[_guardians[2]] = true;

        emit GuardianVaultDeployed(msg.sender, _guardians);
    }

    // ───────────────────────── Wallet ─────────────────────────

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function deposit() external payable {
        require(msg.value > 0, "Must send ETH");
        emit Deposited(msg.sender, msg.value);
    }

    function transfer(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Cannot transfer to zero address");
        require(amount > 0, "Amount must be greater than zero");
        require(amount <= address(this).balance, "Insufficient balance");

        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");

        emit Transferred(to, amount);
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // ───────────────────────── Recovery ─────────────────────────

    function proposeRecovery(address newOwner) external onlyGuardian {
        require(!recoveryRequest.active, "Recovery already active");
        require(newOwner != address(0), "New owner cannot be zero address");
        require(newOwner != owner, "New owner is already the owner");
        require(!isGuardian[newOwner], "New owner cannot be a guardian");

        currentRequestId += 1;
        recoveryRequest = RecoveryRequest({
            proposedOwner: newOwner,
            approvalCount: 1, // proposer auto-approves
            executionTime: 0,
            active: true,
            requestId: currentRequestId
        });
        guardianApprovedRequestId[msg.sender] = currentRequestId;

        emit RecoveryProposed(msg.sender, newOwner, currentRequestId);
    }

    function approveRecovery(address newOwner) external onlyGuardian {
        require(recoveryRequest.active, "No active recovery");
        require(newOwner == recoveryRequest.proposedOwner, "Proposed owner mismatch");
        require(guardianApprovedRequestId[msg.sender] != currentRequestId, "Already approved this request");

        recoveryRequest.approvalCount += 1;
        guardianApprovedRequestId[msg.sender] = currentRequestId;

        if (recoveryRequest.approvalCount >= REQUIRED_APPROVALS && recoveryRequest.executionTime == 0) {
            recoveryRequest.executionTime = block.timestamp + RECOVERY_DELAY;
        }

        emit RecoveryApproved(msg.sender, newOwner, recoveryRequest.approvalCount);
    }

    function cancelRecovery() external onlyOwner {
        require(recoveryRequest.active, "No active recovery");
        _cancelRecovery();
    }

    function executeRecovery() external {
        require(recoveryRequest.active, "No active recovery");
        require(msg.sender == recoveryRequest.proposedOwner, "Not the proposed owner");
        require(
            recoveryRequest.approvalCount >= REQUIRED_APPROVALS && recoveryRequest.executionTime > 0,
            "Approval threshold not met"
        );
        require(block.timestamp >= recoveryRequest.executionTime, "Waiting period not elapsed");

        address oldOwner = owner;
        owner = recoveryRequest.proposedOwner;
        recoveryRequest.active = false;

        emit RecoveryExecuted(oldOwner, owner);
    }

    // ───────────────────────── Guardian management ─────────────────────────

    function replaceGuardian(address oldGuardian, address newGuardian) external onlyOwner {
        require(isGuardian[oldGuardian], "Old address is not a guardian");
        require(newGuardian != address(0), "New guardian cannot be zero address");
        require(newGuardian != owner, "Owner cannot be a guardian");
        require(!isGuardian[newGuardian], "Already a guardian");

        // Auto-cancel any active recovery so a compromised guardian cannot obstruct replacement.
        if (recoveryRequest.active) {
            _cancelRecovery();
        }

        isGuardian[oldGuardian] = false;
        isGuardian[newGuardian] = true;
        for (uint256 i = 0; i < 3; i++) {
            if (guardians[i] == oldGuardian) {
                guardians[i] = newGuardian;
                break;
            }
        }

        emit GuardianReplaced(oldGuardian, newGuardian);
    }

    // ───────────────────────── Views ─────────────────────────

    function getRecoveryDetails()
        external
        view
        returns (
            address proposedOwner,
            uint256 approvalCount,
            uint256 executionTime,
            bool active,
            uint256 requestId
        )
    {
        RecoveryRequest memory r = recoveryRequest;
        return (r.proposedOwner, r.approvalCount, r.executionTime, r.active, r.requestId);
    }

    function getGuardians() external view returns (address[3] memory) {
        return guardians;
    }

    /// @notice True if `guardian` has approved the currently active request.
    function hasApprovedCurrent(address guardian) external view returns (bool) {
        return recoveryRequest.active && guardianApprovedRequestId[guardian] == currentRequestId;
    }

    // ───────────────────────── Internal ─────────────────────────

    function _cancelRecovery() private {
        recoveryRequest.active = false;
        // currentRequestId is NOT decremented: approvals tied to this id can never be reused.
        emit RecoveryCancelled(msg.sender, recoveryRequest.requestId);
    }
}
