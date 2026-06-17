// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./UserOperation.sol";

/**
 * ERC-4337 IAccount interface.
 * Every AutopaySmartWallet must implement this.
 */
interface IAccount {
    /**
     * Validate user's signature and nonce.
     * The entryPoint will call this before executing the UserOperation.
     *
     * @param userOp          The UserOperation to validate.
     * @param userOpHash      The hash of the UserOperation (to sign).
     * @param missingAccountFunds  Missing funds on the account's deposit in the entrypoint.
     *                             0 if the account has sufficient funds.
     *
     * @return validationData SIG_VALIDATION_FAILED(1) on failure.
     *                        0 on success.
     *                        Packed as: `uint48(validAfter) | uint48(validUntil) | uint160(sigFailed)`.
     */
    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData);
}
