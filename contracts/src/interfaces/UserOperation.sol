// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * ERC-4337 UserOperation struct (v0.6).
 * The canonical EntryPoint v0.6 is deployed at:
 *   0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
 * on Avalanche C-Chain and most EVM networks.
 */
struct UserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    uint256 callGasLimit;
    uint256 verificationGasLimit;
    uint256 preVerificationGas;
    uint256 maxFeePerGas;
    uint256 maxPriorityFeePerGas;
    bytes paymasterAndData;
    bytes signature;
}
