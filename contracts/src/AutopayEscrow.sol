// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title AutopayEscrow
 * @notice Holds USDC for unclaimed payments sent to non-Autopayke users.
 *
 * Flow:
 * 1. Sender calls deposit() with a unique claimRef and the recipient's share.
 *    The USDC is pulled from the sender's AutopaySmartWallet (pre-approved).
 * 2. Recipient receives a WhatsApp claim link. They sign up for Autopayke and call claim()
 *    with a backend-issued signature proving they own that phone number.
 * 3. If unclaimed after `expiryDuration`, anyone (typically the Autopayke backend) can call
 *    refund() to return the USDC to the original sender.
 *
 * Security properties:
 * - ReentrancyGuard on all state-changing functions.
 * - One-time claim: claimRef is consumed on success.
 * - Refund only after expiry.
 * - Claim requires a signature from Autopayke's signer key (prevents front-running).
 */
contract AutopayEscrow is ReentrancyGuard, AccessControl {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant SIGNER_ROLE = keccak256("SIGNER_ROLE");

    uint256 public constant DEFAULT_EXPIRY = 7 days;
    uint256 public constant MIN_EXPIRY = 1 hours;
    uint256 public constant MAX_EXPIRY = 30 days;

    // ── Data structures ───────────────────────────────────────────────────────

    enum EscrowStatus { Pending, Claimed, Refunded }

    struct EscrowPayment {
        address sender;
        address token;
        uint256 amount;
        uint256 expiry;
        EscrowStatus status;
    }

    /// @notice claimRef => EscrowPayment
    mapping(bytes32 => EscrowPayment) public payments;

    /// @notice Tokens depositors are allowed to escrow (USDC/USDT only, in practice).
    mapping(address => bool) public allowedTokens;

    // ── Events ────────────────────────────────────────────────────────────────

    event Deposited(
        bytes32 indexed claimRef,
        address indexed sender,
        address indexed token,
        uint256 amount,
        uint256 expiry
    );

    event TokenAllowedSet(address indexed token, bool allowed);

    event Claimed(
        bytes32 indexed claimRef,
        address indexed recipient,
        address token,
        uint256 amount
    );

    event Refunded(
        bytes32 indexed claimRef,
        address indexed sender,
        uint256 amount
    );

    // ── Errors ────────────────────────────────────────────────────────────────

    error AlreadyExists(bytes32 claimRef);
    error NotFound(bytes32 claimRef);
    error AlreadyResolved(bytes32 claimRef, EscrowStatus status);
    error NotExpired(bytes32 claimRef, uint256 expiry, uint256 now_);
    error InvalidExpiry();
    error ZeroAmount();
    error ZeroAddress();
    error InvalidSignature();
    error TokenNotAllowed(address token);

    // ── Constructor ───────────────────────────────────────────────────────────

    /**
     * @param initialTokens Tokens to allow from day one (e.g. USDC, USDT) — avoids a
     *                       separate setTokenAllowed transaction per token after deploy.
     */
    constructor(address admin, address relayer, address signer, address[] memory initialTokens) {
        if (admin == address(0) || relayer == address(0) || signer == address(0)) {
            revert ZeroAddress();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RELAYER_ROLE, relayer);
        _grantRole(SIGNER_ROLE, signer);

        for (uint256 i = 0; i < initialTokens.length; i++) {
            allowedTokens[initialTokens[i]] = true;
            emit TokenAllowedSet(initialTokens[i], true);
        }
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    /**
     * @notice Allow or disallow a token from being escrowed.
     * @dev Restricted to USDC/USDT in practice — guards against depositing an
     *      arbitrary/malicious ERC-20 (fee-on-transfer, rebasing, etc.) that could
     *      desync the recorded `amount` from what's actually held.
     */
    function setTokenAllowed(address token, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        allowedTokens[token] = allowed;
        emit TokenAllowedSet(token, allowed);
    }

    // ── Core functions ────────────────────────────────────────────────────────

    /**
     * @notice Lock USDC in escrow for an unclaimed payment.
     * @dev The sender's wallet must have approved this contract for `amount` of `token`.
     *
     * @param claimRef     Unique reference (bytes32 encoded string, e.g., "ESC-1234")
     * @param token        ERC-20 token address (USDC)
     * @param amount       Amount in token's base units (USDC has 6 decimals)
     * @param expiryOffset Seconds from now until the payment expires (max 30 days)
     */
    function deposit(
        bytes32 claimRef,
        address token,
        uint256 amount,
        uint256 expiryOffset
    ) external nonReentrant {
        if (payments[claimRef].sender != address(0)) revert AlreadyExists(claimRef);
        if (amount == 0) revert ZeroAmount();
        if (token == address(0)) revert ZeroAddress();
        if (!allowedTokens[token]) revert TokenNotAllowed(token);
        if (expiryOffset < MIN_EXPIRY || expiryOffset > MAX_EXPIRY) revert InvalidExpiry();

        uint256 expiry = block.timestamp + expiryOffset;

        // Pull tokens from sender
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        payments[claimRef] = EscrowPayment({
            sender: msg.sender,
            token: token,
            amount: amount,
            expiry: expiry,
            status: EscrowStatus.Pending
        });

        emit Deposited(claimRef, msg.sender, token, amount, expiry);
    }

    /**
     * @notice Claim an escrow payment on behalf of the verified recipient.
     * @dev The Autopayke backend signs a message authorizing the claim only after
     *      the recipient has completed WhatsApp OTP verification.
     *
     * @param claimRef   The escrow reference
     * @param recipient  Address that will receive the tokens
     * @param signature  ECDSA signature by Autopayke signer over (claimRef, recipient, chainId)
     */
    function claim(
        bytes32 claimRef,
        address recipient,
        bytes calldata signature
    ) external nonReentrant {
        EscrowPayment storage payment = payments[claimRef];

        if (payment.sender == address(0)) revert NotFound(claimRef);
        if (payment.status != EscrowStatus.Pending) {
            revert AlreadyResolved(claimRef, payment.status);
        }
        if (recipient == address(0)) revert ZeroAddress();

        // Verify Autopayke signer authorized this claim
        bytes32 digest = keccak256(
            abi.encodePacked(claimRef, recipient, block.chainid)
        ).toEthSignedMessageHash();

        address signer = digest.recover(signature);
        if (!hasRole(SIGNER_ROLE, signer)) revert InvalidSignature();

        uint256 amount = payment.amount;
        address token = payment.token;

        payment.status = EscrowStatus.Claimed;
        payment.amount = 0; // prevent re-entrancy double claim

        IERC20(token).safeTransfer(recipient, amount);

        emit Claimed(claimRef, recipient, token, amount);
    }

    /**
     * @notice Refund an expired escrow payment to the original sender.
     * @dev Anyone can call this after expiry — typically the Autopayke escrow worker.
     *      The relayer can also call it on behalf of any expired escrow.
     *
     * @param claimRef The escrow reference to refund
     */
    function refund(bytes32 claimRef) external nonReentrant {
        EscrowPayment storage payment = payments[claimRef];

        if (payment.sender == address(0)) revert NotFound(claimRef);
        if (payment.status != EscrowStatus.Pending) {
            revert AlreadyResolved(claimRef, payment.status);
        }
        if (block.timestamp < payment.expiry) {
            revert NotExpired(claimRef, payment.expiry, block.timestamp);
        }

        address sender = payment.sender;
        uint256 amount = payment.amount;
        address token = payment.token;

        payment.status = EscrowStatus.Refunded;
        payment.amount = 0;

        IERC20(token).safeTransfer(sender, amount);

        emit Refunded(claimRef, sender, amount);
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    /**
     * @notice Get escrow details for a claim reference.
     */
    function getPayment(bytes32 claimRef)
        external
        view
        returns (
            address sender,
            address token,
            uint256 amount,
            uint256 expiry,
            EscrowStatus status
        )
    {
        EscrowPayment storage p = payments[claimRef];
        return (p.sender, p.token, p.amount, p.expiry, p.status);
    }

    /**
     * @notice Check if a claim reference is refundable right now.
     */
    function isRefundable(bytes32 claimRef) external view returns (bool) {
        EscrowPayment storage p = payments[claimRef];
        return p.status == EscrowStatus.Pending && block.timestamp >= p.expiry;
    }
}
