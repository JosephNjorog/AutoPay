// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "./interfaces/IPaymaster.sol";
import "./interfaces/IEntryPoint.sol";
import "./interfaces/UserOperation.sol";
import "./AutopayRegistry.sol";

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
 * - dailySponsorshipLimit: cap on cumulative gas sponsored per wallet per day —
 *   bounds how much a single compromised/malicious wallet can drain even across
 *   many UserOperations (0 = no per-wallet cap beyond maxGasPerOp).
 * - sponsoredWallets: relayer-approved wallets, now cross-checked against
 *   AutopayRegistry at approval time — the relayer can no longer sponsor an
 *   address that was never actually deployed as an Autopayke wallet, which
 *   matters if the relayer key itself is ever compromised.
 *
 * Deposit management:
 * - The RELAYER_ROLE can top up the paymaster deposit (depositTo).
 * - The ADMIN can withdraw remaining funds, pause sponsorship entirely, and
 *   raise/lower the daily cap.
 */
contract AutopayPaymaster is IPaymaster, AccessControl, Pausable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    IEntryPoint public immutable entryPoint;
    AutopayRegistry public immutable registry;

    /// @notice Maximum gas in wei we'll sponsor per UserOperation
    uint256 public maxGasPerOp = 0.005 ether; // ~5 million gas units at 1 gwei

    /// @notice Maximum gas in wei we'll sponsor per wallet per day. 0 = no extra cap.
    uint256 public dailySponsorshipLimit;

    /// @notice Wallets that are allowed to be sponsored
    mapping(address => bool) public sponsoredWallets;

    /// @notice wallet => day bucket => gas already reserved/sponsored today
    mapping(address => mapping(uint256 => uint256)) private _sponsoredToday;

    // ── Events ────────────────────────────────────────────────────────────────

    event GasSponsored(address indexed wallet, uint256 gasCost, bytes32 userOpHash);
    event WalletApproved(address indexed wallet);
    event WalletRevoked(address indexed wallet);
    event MaxGasUpdated(uint256 oldMax, uint256 newMax);
    event DailySponsorshipLimitUpdated(uint256 oldLimit, uint256 newLimit);
    event DepositAdded(uint256 amount, uint256 newBalance);

    // ── Errors ────────────────────────────────────────────────────────────────

    error WalletNotSponsored(address wallet);
    error WalletNotRegistered(address wallet);
    error GasLimitExceeded(uint256 requested, uint256 max);
    error DailySponsorshipLimitExceeded(address wallet, uint256 attempted, uint256 limit);
    error NotEntryPoint();
    error ZeroAddress();

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(IEntryPoint _entryPoint, AutopayRegistry _registry, address admin, address relayer) {
        if (
            address(_entryPoint) == address(0) ||
            address(_registry) == address(0) ||
            admin == address(0) ||
            relayer == address(0)
        ) revert ZeroAddress();
        entryPoint = _entryPoint;
        registry = _registry;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RELAYER_ROLE, relayer);
    }

    // ── IPaymaster ────────────────────────────────────────────────────────────

    /**
     * @notice Called by the EntryPoint to verify this paymaster will cover gas.
     *
     * Validates:
     * 1. sponsorship isn't paused
     * 2. sender is a sponsored Autopayke wallet
     * 3. max gas cost does not exceed our per-op limit
     * 4. wallet hasn't exhausted its daily sponsorship budget
     *
     * Returns a context containing (wallet, userOpHash) for postOp accounting.
     */
    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external override whenNotPaused returns (bytes memory context, uint256 validationData) {
        if (msg.sender != address(entryPoint)) revert NotEntryPoint();

        address wallet = userOp.sender;

        if (!sponsoredWallets[wallet]) revert WalletNotSponsored(wallet);
        if (maxCost > maxGasPerOp) revert GasLimitExceeded(maxCost, maxGasPerOp);

        if (dailySponsorshipLimit > 0) {
            uint256 day = block.timestamp / 1 days;
            uint256 spent = _sponsoredToday[wallet][day] + maxCost;
            if (spent > dailySponsorshipLimit) {
                revert DailySponsorshipLimitExceeded(wallet, spent, dailySponsorshipLimit);
            }
            _sponsoredToday[wallet][day] = spent;
        }

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

    // ── Emergency pause ───────────────────────────────────────────────────────

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ── Wallet management ─────────────────────────────────────────────────────

    /**
     * @notice Approve a wallet address for gas sponsorship.
     * @dev Called by the relayer immediately after wallet creation. Cross-checks
     *      AutopayRegistry rather than trusting the relayer's input blindly — if
     *      the relayer key is ever compromised, an attacker still can't get an
     *      arbitrary contract sponsored without it also being a genuinely
     *      registered Autopayke wallet.
     */
    function approveWallet(address wallet) external onlyRole(RELAYER_ROLE) {
        if (wallet == address(0)) revert ZeroAddress();
        if (!registry.isWalletRegistered(wallet)) revert WalletNotRegistered(wallet);
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
            if (wallets[i] != address(0) && registry.isWalletRegistered(wallets[i])) {
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

    /**
     * @notice Update the per-wallet daily sponsorship cap. 0 disables the cap.
     */
    function setDailySponsorshipLimit(uint256 newLimit) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit DailySponsorshipLimitUpdated(dailySponsorshipLimit, newLimit);
        dailySponsorshipLimit = newLimit;
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
