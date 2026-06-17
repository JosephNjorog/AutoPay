// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "./interfaces/IPaymaster.sol";
import "./interfaces/IEntryPoint.sol";
import "./interfaces/UserOperation.sol";

/**
 * @title AutopayPaymaster
 * @notice ERC-4337 Paymaster that sponsors gas for all Autopayke wallet operations.
 *
 * How it works:
 * - Autopayke funds this contract with AVAX deposited into the EntryPoint.
 * - When a user's UserOperation arrives at the bundler, the bundler calls
 *   validatePaymasterUserOp() here. We verify the UserOp comes from a
 *   registered AutopaySmartWallet and approve sponsorship.
 * - The EntryPoint deducts gas from our deposit.
 * - The user pays zero AVAX. Autopayke recoups costs via the 2.3% FX spread.
 *
 * Sponsorship limits:
 * - maxGasPerOp: cap per UserOperation to prevent abuse.
 * - whitelistedWallets: only registered AutopaySmartWallet addresses are sponsored.
 *   In practice, we verify via AutopayRegistry; however this contract also keeps
 *   an internal whitelist for fast on-chain checking.
 *
 * Deposit management:
 * - The RELAYER_ROLE can top up the paymaster deposit (depositTo).
 * - The ADMIN can withdraw remaining funds.
 */
contract AutopayPaymaster is IPaymaster, AccessControl {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    IEntryPoint public immutable entryPoint;

    /// @notice Maximum gas in wei we'll sponsor per UserOperation
    uint256 public maxGasPerOp = 0.005 ether; // ~5 million gas units at 1 gwei

    /// @notice Wallets that are allowed to be sponsored
    mapping(address => bool) public sponsoredWallets;

    // ── Events ────────────────────────────────────────────────────────────────

    event GasSponsored(address indexed wallet, uint256 gasCost, bytes32 userOpHash);
    event WalletApproved(address indexed wallet);
    event WalletRevoked(address indexed wallet);
    event MaxGasUpdated(uint256 oldMax, uint256 newMax);
    event DepositAdded(uint256 amount, uint256 newBalance);

    // ── Errors ────────────────────────────────────────────────────────────────

    error WalletNotSponsored(address wallet);
    error GasLimitExceeded(uint256 requested, uint256 max);
    error NotEntryPoint();
    error ZeroAddress();

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(IEntryPoint _entryPoint, address admin, address relayer) {
        if (address(_entryPoint) == address(0)) revert ZeroAddress();
        entryPoint = _entryPoint;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RELAYER_ROLE, relayer);
    }

    // ── IPaymaster ────────────────────────────────────────────────────────────

    /**
     * @notice Called by the EntryPoint to verify this paymaster will cover gas.
     *
     * Validates:
     * 1. sender is a sponsored Autopayke wallet
     * 2. max gas cost does not exceed our per-op limit
     *
     * Returns a context containing (wallet, userOpHash) for postOp accounting.
     */
    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external override returns (bytes memory context, uint256 validationData) {
        if (msg.sender != address(entryPoint)) revert NotEntryPoint();

        address wallet = userOp.sender;

        if (!sponsoredWallets[wallet]) revert WalletNotSponsored(wallet);
        if (maxCost > maxGasPerOp) revert GasLimitExceeded(maxCost, maxGasPerOp);

        // Pack context for postOp: (wallet address, userOpHash)
        context = abi.encode(wallet, userOpHash);
        validationData = 0; // 0 = valid, no time bounds
    }

    /**
     * @notice Called after the UserOperation executes.
     * @dev We emit a GasSponsored event here for off-chain accounting.
     *      actualGasCost is the true cost deducted from our EntryPoint deposit.
     */
    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost
    ) external override {
        if (msg.sender != address(entryPoint)) revert NotEntryPoint();

        (address wallet, bytes32 userOpHash) = abi.decode(context, (address, bytes32));

        // mode == opReverted means the user op failed, but we still paid gas.
        // We log it either way for off-chain reconciliation.
        emit GasSponsored(wallet, actualGasCost, userOpHash);
    }

    // ── Wallet management ─────────────────────────────────────────────────────

    /**
     * @notice Approve a wallet address for gas sponsorship.
     * @dev Called by the relayer immediately after wallet creation.
     */
    function approveWallet(address wallet) external onlyRole(RELAYER_ROLE) {
        if (wallet == address(0)) revert ZeroAddress();
        sponsoredWallets[wallet] = true;
        emit WalletApproved(wallet);
    }

    /**
     * @notice Batch approve — gas efficient for initial migrations.
     */
    function batchApproveWallets(address[] calldata wallets)
        external
        onlyRole(RELAYER_ROLE)
    {
        for (uint256 i = 0; i < wallets.length; i++) {
            if (wallets[i] != address(0)) {
                sponsoredWallets[wallets[i]] = true;
                emit WalletApproved(wallets[i]);
            }
        }
    }

    /**
     * @notice Revoke sponsorship (e.g., suspicious activity).
     */
    function revokeWallet(address wallet) external onlyRole(RELAYER_ROLE) {
        sponsoredWallets[wallet] = false;
        emit WalletRevoked(wallet);
    }

    // ── Deposit management ────────────────────────────────────────────────────

    /**
     * @notice Top up the paymaster's AVAX deposit in the EntryPoint.
     */
    function deposit() external payable onlyRole(RELAYER_ROLE) {
        entryPoint.depositTo{value: msg.value}(address(this));
        emit DepositAdded(msg.value, entryPoint.balanceOf(address(this)));
    }

    /**
     * @notice View current deposit balance.
     */
    function getDeposit() external view returns (uint256) {
        return entryPoint.balanceOf(address(this));
    }

    /**
     * @notice Withdraw remaining deposit (admin only).
     */
    function withdrawDeposit(address payable to, uint256 amount)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        entryPoint.withdrawTo(to, amount);
    }

    // ── Config ────────────────────────────────────────────────────────────────

    /**
     * @notice Update the per-op gas cap.
     */
    function setMaxGasPerOp(uint256 newMax) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit MaxGasUpdated(maxGasPerOp, newMax);
        maxGasPerOp = newMax;
    }

    // ── Stake (required for paymaster operation) ──────────────────────────────

    /**
     * @notice Add stake to the EntryPoint (required for paymasters).
     * @param unstakeDelaySec Minimum delay before unstaking (recommend 1 day = 86400).
     */
    function addStake(uint32 unstakeDelaySec) external payable onlyRole(DEFAULT_ADMIN_ROLE) {
        entryPoint.addStake{value: msg.value}(unstakeDelaySec);
    }

    function unlockStake() external onlyRole(DEFAULT_ADMIN_ROLE) {
        entryPoint.unlockStake();
    }

    function withdrawStake(address payable to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        entryPoint.withdrawStake(to);
    }

    receive() external payable {}
}
