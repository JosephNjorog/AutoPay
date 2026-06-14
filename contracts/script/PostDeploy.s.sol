// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/TumaPaymaster.sol";

/**
 * @title PostDeploy
 * @notice Funds the TumaPaymaster deposit and stake in the ERC-4337 EntryPoint.
 *
 * Run after Deploy.s.sol once the paymaster address is known:
 *   TUMA_PAYMASTER_ADDRESS=0x... forge script script/PostDeploy.s.sol \
 *     --rpc-url fuji --broadcast -vvvv
 *
 * Required env vars:
 *   DEPLOYER_PRIVATE_KEY      Admin EOA (holds AVAX for funding)
 *   TUMA_PAYMASTER_ADDRESS    From Deploy.s.sol output
 */
contract PostDeploy is Script {
    uint256 constant DEPOSIT_AMOUNT = 2 ether;  // 2 AVAX into EntryPoint deposit
    uint256 constant STAKE_AMOUNT   = 1 ether;  // 1 AVAX stake (prevents DoS)
    uint32  constant UNSTAKE_DELAY  = 86_400;   // 24 hours minimum unlock delay

    function run() external {
        uint256 deployerKey   = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address paymasterAddr = vm.envAddress("TUMA_PAYMASTER_ADDRESS");

        TumaPaymaster paymaster = TumaPaymaster(payable(paymasterAddr));

        console.log("=== TUMA PostDeploy: Fund Paymaster ===");
        console.log("Paymaster: ", paymasterAddr);
        console.log("Network:   ", block.chainid == 43114 ? "Avalanche Mainnet" : "Fuji Testnet");

        vm.startBroadcast(deployerKey);

        // Fund the EntryPoint deposit so the Paymaster can cover user gas
        paymaster.deposit{value: DEPOSIT_AMOUNT}();
        console.log("Deposited", DEPOSIT_AMOUNT / 1e18, "AVAX into EntryPoint");

        // Add stake — required by EntryPoint for Paymaster to be trusted
        paymaster.addStake{value: STAKE_AMOUNT}(UNSTAKE_DELAY);
        console.log("Staked   ", STAKE_AMOUNT / 1e18, "AVAX (24h unlock delay)");

        vm.stopBroadcast();

        uint256 deposit = paymaster.getDeposit();
        console.log("Current EntryPoint deposit:", deposit / 1e18, "AVAX");

        console.log("");
        console.log("=== Post-deploy checklist ===");
        console.log("[ ] Run ApproveWallets.s.sol to batch-enable existing user wallets");
        console.log("[ ] Alert when deposit < 0.5 AVAX: monitor paymaster.getDeposit()");
        console.log("[ ] Update TUMA_PAYMASTER_ADDRESS in backend .env");
        console.log("[ ] Set NODE_ENV=production to switch from Fuji to mainnet");
    }
}
