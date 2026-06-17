// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "./AutopaySmartWallet.sol";
import "./interfaces/IEntryPoint.sol";

/**
 * @title AutopayWalletFactory
 * @notice Deploys AutopaySmartWallet instances using CREATE2 for deterministic addresses.
 *
 * The wallet address is deterministic given:
 *   - owner EOA (derived from phone hash + Autopayke secret)
 *   - phoneHash (keccak256 of salted phone)
 *
 * This means the address can be predicted before deployment — the frontend can
 * show the wallet address immediately after signup, even before the tx confirms.
 */
contract AutopayWalletFactory is AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    IEntryPoint public immutable entryPoint;
    address public immutable guardian;

    // ── Events ────────────────────────────────────────────────────────────────

    event WalletCreated(
        bytes32 indexed phoneHash,
        address indexed owner,
        address indexed wallet
    );

    // ── Errors ────────────────────────────────────────────────────────────────

    error NotAuthorized();
    error ZeroAddress();
    error WalletAlreadyDeployed(address wallet);

    // ── Constructor ───────────────────────────────────────────────────────────

    /**
     * @param _entryPoint  The ERC-4337 EntryPoint (0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789)
     * @param _guardian    Autopayke relayer address (set as guardian on every wallet)
     * @param admin        Admin address (can grant RELAYER_ROLE)
     * @param relayer      Relayer address (can call createWallet)
     */
    constructor(
        IEntryPoint _entryPoint,
        address _guardian,
        address admin,
        address relayer
    ) {
        if (address(_entryPoint) == address(0) || _guardian == address(0)) revert ZeroAddress();
        entryPoint = _entryPoint;
        guardian = _guardian;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RELAYER_ROLE, relayer);
    }

    // ── Deployment ────────────────────────────────────────────────────────────

    /**
     * @notice Deploy a new AutopaySmartWallet for a user.
     * @dev Idempotent — returns existing address if already deployed.
     * @param owner     The user's derived EOA address
     * @param phoneHash keccak256(SECRET_SALT + phone)
     * @return wallet   The wallet address (deployed or pre-existing)
     */
    function createWallet(address owner, bytes32 phoneHash)
        external
        onlyRole(RELAYER_ROLE)
        returns (address wallet)
    {
        if (owner == address(0)) revert ZeroAddress();

        wallet = getWalletAddress(owner, phoneHash);

        // Idempotent — if already deployed, just return the address
        if (wallet.code.length > 0) return wallet;

        bytes32 salt = keccak256(abi.encodePacked(owner, phoneHash));
        bytes memory bytecode = _creationCode(owner);

        address deployed = Create2.deploy(0, salt, bytecode);

        // Initialize the wallet
        AutopaySmartWallet(payable(deployed)).initialize(owner, guardian);

        emit WalletCreated(phoneHash, owner, deployed);
        return deployed;
    }

    /**
     * @notice Predict the wallet address before deployment.
     * @dev Cheap view call — use this to show users their address immediately.
     */
    function getWalletAddress(address owner, bytes32 phoneHash)
        public
        view
        returns (address)
    {
        bytes32 salt = keccak256(abi.encodePacked(owner, phoneHash));
        bytes32 bytecodeHash = keccak256(_creationCode(owner));
        return Create2.computeAddress(salt, bytecodeHash);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _creationCode(address /*owner*/) internal view returns (bytes memory) {
        return abi.encodePacked(
            type(AutopaySmartWallet).creationCode,
            abi.encode(address(entryPoint))
        );
    }
}
