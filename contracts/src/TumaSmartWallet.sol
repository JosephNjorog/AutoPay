// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IAccount.sol";
import "./interfaces/IEntryPoint.sol";
import "./interfaces/UserOperation.sol";

/**
 * @title TumaSmartWallet
 * @notice ERC-4337 smart account for each TUMA user.
 *
 * Architecture:
 * - owner:   The user's EOA derived from their phone hash + TUMA secret.
 *            Signs UserOperations directly.
 * - guardian: TUMA backend relayer. Can execute transactions on behalf of the user
 *             (for the relayer model used before passkey upgrades).
 *
 * Upgrade path:
 * - Phase 1 (current): guardian relayer signs ops, user just does OTP auth.
 * - Phase 2: User sets their own passkey key, guardian role becomes recovery-only.
 *
 * Deployed via TumaWalletFactory using CREATE2 for deterministic addresses.
 */
contract TumaSmartWallet is IAccount, ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    using SafeERC20 for IERC20;

    // ── State ─────────────────────────────────────────────────────────────────

    IEntryPoint public immutable entryPoint;

    address public owner;
    address public guardian;
    bool public initialized;

    uint256 private constant SIG_VALIDATION_FAILED = 1;

    // ── Events ────────────────────────────────────────────────────────────────

    event WalletInitialized(address indexed owner, address indexed guardian);
    event Executed(address indexed to, uint256 value, bytes data, bool success);
    event TokenTransferred(address indexed token, address indexed to, uint256 amount);
    event OwnerUpdated(address indexed oldOwner, address indexed newOwner);
    event GuardianUpdated(address indexed oldGuardian, address indexed newGuardian);
    event Received(address indexed from, uint256 amount);

    // ── Errors ────────────────────────────────────────────────────────────────

    error AlreadyInitialized();
    error NotAuthorized();
    error ExecutionFailed(bytes returnData);
    error InvalidSignature();
    error ZeroAddress();
    error InsufficientBalance(uint256 required, uint256 available);

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyOwnerOrGuardian() {
        if (msg.sender != owner && msg.sender != guardian && msg.sender != address(entryPoint)) {
            revert NotAuthorized();
        }
        _;
    }

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert NotAuthorized();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotAuthorized();
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(IEntryPoint _entryPoint) {
        entryPoint = _entryPoint;
    }

    /**
     * @notice Initialize the wallet with owner and guardian.
     * @dev Called once by the factory immediately after deployment.
     */
    function initialize(address _owner, address _guardian) external {
        if (initialized) revert AlreadyInitialized();
        if (_owner == address(0) || _guardian == address(0)) revert ZeroAddress();

        owner = _owner;
        guardian = _guardian;
        initialized = true;

        emit WalletInitialized(_owner, _guardian);
    }

    // ── ERC-4337 ──────────────────────────────────────────────────────────────

    /**
     * @notice Validates a UserOperation signature.
     * @dev The entryPoint calls this. Accepts signatures from either owner or guardian.
     */
    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external override returns (uint256 validationData) {
        if (msg.sender != address(entryPoint)) revert NotAuthorized();

        // Pay the entryPoint what it needs
        if (missingAccountFunds > 0) {
            (bool ok,) = payable(address(entryPoint)).call{value: missingAccountFunds}("");
            (ok); // suppress warning; EntryPoint handles the case where this fails
        }

        // Accept signature from owner OR guardian
        bytes32 ethHash = userOpHash.toEthSignedMessageHash();
        address signer = ethHash.recover(userOp.signature);

        if (signer == owner || signer == guardian) {
            return 0; // valid
        }

        return SIG_VALIDATION_FAILED;
    }

    // ── Execution ─────────────────────────────────────────────────────────────

    /**
     * @notice Execute a single call. Called by the EntryPoint or guardian.
     * @param to     Target address
     * @param value  AVAX to send
     * @param data   Calldata
     */
    function execute(address to, uint256 value, bytes calldata data)
        external
        nonReentrant
        onlyOwnerOrGuardian
    {
        (bool success, bytes memory result) = to.call{value: value}(data);
        if (!success) revert ExecutionFailed(result);
        emit Executed(to, value, data, success);
    }

    /**
     * @notice Execute a batch of calls atomically.
     */
    function executeBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata dataArr
    ) external nonReentrant onlyOwnerOrGuardian {
        require(targets.length == values.length && values.length == dataArr.length, "Length mismatch");

        for (uint256 i = 0; i < targets.length; i++) {
            (bool success, bytes memory result) = targets[i].call{value: values[i]}(dataArr[i]);
            if (!success) revert ExecutionFailed(result);
            emit Executed(targets[i], values[i], dataArr[i], success);
        }
    }

    /**
     * @notice Convenience function to transfer an ERC-20 token.
     * @param token  Token contract address (USDC, USDT, etc.)
     * @param to     Recipient address
     * @param amount Amount in token's base units
     */
    function transferToken(address token, address to, uint256 amount)
        external
        nonReentrant
        onlyOwnerOrGuardian
    {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit TokenTransferred(token, to, amount);
    }

    /**
     * @notice Approve a spender to pull tokens (e.g., TumaEscrow pulling USDC).
     */
    function approveToken(address token, address spender, uint256 amount)
        external
        onlyOwnerOrGuardian
    {
        IERC20(token).approve(spender, amount);
    }

    // ── Owner management ──────────────────────────────────────────────────────

    /**
     * @notice Transfer wallet ownership (e.g., when user upgrades to passkey).
     * @dev Only the current owner or guardian can do this.
     */
    function updateOwner(address newOwner) external onlyOwnerOrGuardian {
        if (newOwner == address(0)) revert ZeroAddress();
        address old = owner;
        owner = newOwner;
        emit OwnerUpdated(old, newOwner);
    }

    /**
     * @notice Update the guardian (TUMA relayer rotation or user self-custody upgrade).
     * @dev Only the current guardian can update guardian.
     */
    function updateGuardian(address newGuardian) external onlyGuardian {
        if (newGuardian == address(0)) revert ZeroAddress();
        address old = guardian;
        guardian = newGuardian;
        emit GuardianUpdated(old, newGuardian);
    }

    // ── EntryPoint deposit management ─────────────────────────────────────────

    /**
     * @notice Deposit AVAX into the EntryPoint for gas prepayment.
     */
    function addDeposit() external payable {
        entryPoint.depositTo{value: msg.value}(address(this));
    }

    /**
     * @notice Withdraw AVAX from the EntryPoint deposit.
     */
    function withdrawDeposit(address payable to, uint256 amount) external onlyOwner {
        entryPoint.withdrawTo(to, amount);
    }

    /**
     * @notice View EntryPoint deposit balance.
     */
    function getDeposit() external view returns (uint256) {
        return entryPoint.balanceOf(address(this));
    }

    // ── Receive AVAX ─────────────────────────────────────────────────────────

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    fallback() external payable {}
}
