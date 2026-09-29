// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SimpleWallet
/// @notice Minimal owner-only wallet with NO recovery. Used as a baseline for comparison.
contract SimpleWallet {
    address public owner;

    event Deposited(address indexed sender, uint256 amount);
    event Transferred(address indexed to, uint256 amount);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function deposit() external payable {
        require(msg.value > 0, "Must send ETH");
        emit Deposited(msg.sender, msg.value);
    }

    function transfer(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Cannot transfer to zero address");
        require(amount > 0 && amount <= address(this).balance, "Invalid amount");
        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");
        emit Transferred(to, amount);
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
