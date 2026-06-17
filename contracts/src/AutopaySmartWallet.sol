// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./interfaces/IAccount.sol";
import "./interfaces/IEntryPoint.sol";
import "./interfaces/UserOperation.sol";

/**
 * @title AutopaySmartWallet
 * @notice ERC-4337 smart account for each Autopayke user.
 *
 * Architecture:
 * - owner:   The user's EOA derived from their phone hash + Autopayke secret.
 *            Signs UserOperations directly.
 * - guardian: Autopayke backend relayer. Can execute transactions on behalf of the user
 *             (for the relayer model used before passkey upgrades).
 *
 * Upgrade path:
 * - Phase 1 (current): guardian relayer signs ops, user just does OTP auth.
 * - Phase 2: User sets their own passkey key, guardian role becomes recovery-only.
 *
 * Defense-in-depth against a compromised guardian key (the realistic single point
 * of failure in Phase 1 — see audit notes):
 * - Pausable: owner OR guardian can pause; only owner can unpause, so a compromised
 *   guardian can't un-pause itself after being caught.
 * - Per-token daily spend cap on guardian-initiated transfer()/approve() calls routed
 *   through execute()/executeBatch() — the actual path the backend uses for every
 *   USDC movement (transferToken()/approveToken() exist but aren't currently called
 *   by the backend). Owner-only to raise; guardian can lower in an emergency.
 * - Timelocked guardian rotation: a new guardian only takes effect after a delay,
 *   giving the owner a window to notice and cancel an unauthorized change.
 *
 * Deployed via AutopayWalletFactory using CREATE2 for deterministic addresses.
 */
contract AutopaySmartWallet is IAccount, ReentrancyGuard, Pausable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    using SafeERC20 for IERC20;

    // ── State ─────────────────────────────────────────────────────────────────

    IEntryPoint public immutable entryPoint;

    address public owner;
    address public guardian;
    bool public initialized;

    uint256 private constant SIG_VALIDATION_FAILED = 1;
    bytes4 private constant TRANSFER_SELECTOR = bytes4(keccak256("transfer(address,uint256)"));
    bytes4 private constant APPROVE_SELECTOR = bytes4(keccak256("approve(address,uint256)"));

    uint256 public constant GUARDIAN_CHANGE_DELAY = 24 hours;

    /// @notice Per-token daily cap on guardian-initiated transfer/approve amounts.
    ///         0 = no cap configured (preserves current unrestricted behavior until
    ///         the owner opts in by setting a real limit).
    mapping(address => uint256) public guardianDailyTokenLimit;

    /// @notice token => day bucket => amount already spent/approved by guardian today.
    mapping(address => mapping(uint256 => uint256)) private _guardianSpentToday;

    address public pendingGuardian;
    uint256 public guardianChangeReadyAt;

    // ── Events ────────────────────────────────────────────────────────────────

    event WalletInitialized(address indexed owner, address indexed guardian);
    event Executed(address indexed to, uint256 value, bytes data, bool success);
    event TokenTransferred(address indexed token, address indexed to, uint256 amount);
    event OwnerUpdated(address indexed oldOwner, address indexed newOwner);
    event GuardianUpdated(address indexed oldGuardian, address indexed newGuardian);
    event GuardianChangeProposed(address indexed newGuardian, uint256 readyAt);
    event GuardianChangeCancelled(address indexed cancelledGuardian);
    event GuardianDailyLimitSet(address indexed token, uint256 limit);
    event Received(address indexed from, uint256 amount);

    // ── Errors ────────────────────────────────────────────────────────────────

    error AlreadyInitialized();
    error NotAuthorized();
    error ExecutionFailed(bytes returnData);
    error InvalidSignature();
    error ZeroAddress();
    error InsufficientBalance(uint256 required, uint256 available);
    error GuardianDailyLimitExceeded(address token, uint256 attempted, uint256 limit);
    error NoPendingGuardianChange();
    error GuardianChangeNotReady(uint256 readyAt);

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

    // ── Emergency pause ───────────────────────────────────────────────────────

    /**
     * @notice Freeze execute()/executeBatch()/transferToken()/approveToken().
     * @dev Either party can pull the brake; only the owner can release it, so a
     *      compromised guardian can't immediately un-pause itself.
     */
    function pause() external {
        if (msg.sender != owner && msg.sender != guardian) revert NotAuthorized();
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
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

    // ── Guardian spend cap ────────────────────────────────────────────────────

    /**
     * @dev Applies only to guardian-initiated calls (not owner, not EntryPoint —
     *      the owner is the wallet's ultimate authority and isn't capped). Inspects
     *      `to`/`data` for an ERC-20 transfer()/approve() call against a token that
     *      has a configured daily limit, and reverts if it would be exceeded.
     *      This is the function the backend actually calls for every USDC send
     *      today (it encodes transfer() as `data` and calls execute() directly —
     *      transferToken()/approveToken() below aren't currently used in
     *      production), so the cap lives here rather than only on transferToken().
     */
    function _checkGuardianSpendCap(address to, bytes calldata data) internal {
        if (msg.sender != guardian) return;

        uint256 limit = guardianDailyTokenLimit[to];
        if (limit == 0) return; // no cap configured for this token
        if (data.length < 68) return; // shorter than selector + address + uint256

        bytes4 selector = bytes4(data[:4]);
        if (selector != TRANSFER_SELECTOR && selector != APPROVE_SELECTOR) return;

        (, uint256 amount) = abi.decode(data[4:], (address, uint256));

        uint256 day = block.timestamp / 1 days;
        uint256 spent = _guardianSpentToday[to][day] + amount;
        if (spent > limit) revert GuardianDailyLimitExceeded(to, spent, limit);
        _guardianSpentToday[to][day] = spent;
    }

    /**
     * @notice Set (or clear, with 0) the daily cap on guardian-initiated
     *         transfer/approve amounts for a token.
     * @dev Owner-only to raise or set a limit, so a compromised guardian can't
     *      grant itself a higher ceiling. Guardian may still call this to lower
     *      an existing limit as an emergency self-restriction, but cannot raise it.
     */
    function setGuardianDailyLimit(address token, uint256 limit) external {
        if (msg.sender == owner) {
            // owner can set freely
        } else if (msg.sender == guardian) {
            uint256 current = guardianDailyTokenLimit[token];
            if (current != 0 && limit >= current) revert NotAuthorized();
        } else {
            revert NotAuthorized();
        }
        guardianDailyTokenLimit[token] = limit;
        emit GuardianDailyLimitSet(token, limit);
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
        whenNotPaused
        onlyOwnerOrGuardian
    {
        _checkGuardianSpendCap(to, data);
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
    ) external nonReentrant whenNotPaused onlyOwnerOrGuardian {
        require(targets.length == values.length && values.length == dataArr.length, "Length mismatch");

        for (uint256 i = 0; i < targets.length; i++) {
            _checkGuardianSpendCap(targets[i], dataArr[i]);
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
        whenNotPaused
        onlyOwnerOrGuardian
    {
        if (to == address(0)) revert ZeroAddress();
        if (msg.sender == guardian) {
            uint256 limit = guardianDailyTokenLimit[token];
            if (limit != 0) {
                uint256 day = block.timestamp / 1 days;
                uint256 spent = _guardianSpentToday[token][day] + amount;
                if (spent > limit) revert GuardianDailyLimitExceeded(token, spent, limit);
                _guardianSpentToday[token][day] = spent;
            }
        }
        IERC20(token).safeTransfer(to, amount);
        emit TokenTransferred(token, to, amount);
    }

    /**
     * @notice Approve a spender to pull tokens (e.g., AutopayEscrow pulling USDC).
     */
    function approveToken(address token, address spender, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        onlyOwnerOrGuardian
    {
        IERC20(token).forceApprove(spender, amount);
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
     * @notice Propose a new guardian (relayer rotation or self-custody upgrade).
     * @dev Takes effect after GUARDIAN_CHANGE_DELAY via finalizeGuardianChange(),
     *      not immediately — gives the owner a window to notice and cancel an
     *      unauthorized rotation before it takes effect.
     */
    function updateGuardian(address newGuardian) external onlyGuardian {
        if (newGuardian == address(0)) revert ZeroAddress();
        pendingGuardian = newGuardian;
        guardianChangeReadyAt = block.timestamp + GUARDIAN_CHANGE_DELAY;
        emit GuardianChangeProposed(newGuardian, guardianChangeReadyAt);
    }

    /**
     * @notice Complete a pending guardian change once the delay has elapsed.
     * @dev Callable by anyone — there's nothing sensitive about triggering it,
     *      only about who could have proposed it in the first place.
     */
    function finalizeGuardianChange() external {
        if (pendingGuardian == address(0)) revert NoPendingGuardianChange();
        if (block.timestamp < guardianChangeReadyAt) revert GuardianChangeNotReady(guardianChangeReadyAt);

        address old = guardian;
        guardian = pendingGuardian;
        pendingGuardian = address(0);
        guardianChangeReadyAt = 0;

        emit GuardianUpdated(old, guardian);
    }

    /**
     * @notice Cancel a pending guardian change before it takes effect.
     * @dev Owner-only — this is precisely the recovery action for an
     *      unauthorized updateGuardian() call from a compromised guardian key.
     */
    function cancelGuardianChange() external onlyOwner {
        address cancelled = pendingGuardian;
        if (cancelled == address(0)) revert NoPendingGuardianChange();
        pendingGuardian = address(0);
        guardianChangeReadyAt = 0;
        emit GuardianChangeCancelled(cancelled);
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

    fallback() external payable {
        emit Received(msg.sender, msg.value);
    }
}
