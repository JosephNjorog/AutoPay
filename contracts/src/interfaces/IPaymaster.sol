// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./UserOperation.sol";

/**
 * ERC-4337 IPaymaster interface.
 * AutopayPaymaster implements this to sponsor gas for Autopayke wallet operations.
 */
interface IPaymaster {
    enum PostOpMode {
        opSucceeded,   // User op succeeded.
        opReverted,    // User op reverted. Still pay gas.
        postOpReverted // postOp itself reverted.
    }

    /**
     * Payment validation: check if paymaster agrees to pay for this UserOperation.
     *
     * @param userOp       The UserOperation to validate.
     * @param userOpHash   The hash of the UserOperation.
     * @param maxCost      The maximum gas cost that the paymaster will need to pay.
     *
     * @return context     Value to send to postOp (empty to skip postOp).
     * @return validationData  0 on success, 1 if paymaster rejects. Same encoding as IAccount.
     */
    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external returns (bytes memory context, uint256 validationData);

    /**
     * Post-operation handler.
     * Called after UserOperation execution.
     *
     * @param mode     Enum: success, reverted, or postOpReverted.
     * @param context  Value returned by validatePaymasterUserOp.
     * @param actualGasCost  Actual gas used (excluding postOp gas).
     */
    function postOp(PostOpMode mode, bytes calldata context, uint256 actualGasCost) external;
}
