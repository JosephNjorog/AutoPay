// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AutopayPaymaster.sol";
import "../src/AutopayRegistry.sol";
import "../src/interfaces/IEntryPoint.sol";
import "../src/interfaces/UserOperation.sol";

// Minimal mock for EntryPoint (we just need depositTo/balanceOf/withdrawTo/stake no-ops)
contract MockEntryPoint {
    mapping(address => uint256) public deposits;

    function depositTo(address account) external payable {
        deposits[account] += msg.value;
    }

    function balanceOf(address account) external view returns (uint256) {
        return deposits[account];
    }

    function withdrawTo(address payable to, uint256 amount) external {
        deposits[msg.sender] -= amount;
        to.transfer(amount);
    }

    function getNonce(address, uint192) external pure returns (uint256) { return 0; }
    function addStake(uint32) external payable {}
    function unlockStake() external {}
    function withdrawStake(address payable) external {}
    function handleOps(UserOperation[] calldata, address payable) external {}
    function handleAggregatedOps(IEntryPoint.UserOpsPerAggregator[] calldata, address payable) external {}
    function simulateValidation(UserOperation calldata) external {}

    receive() external payable {}
}

contract AutopayPaymasterTest is Test {
    AutopayPaymaster public paymaster;
    AutopayRegistry public registry;
    MockEntryPoint public entryPoint;

    address public admin = makeAddr("admin");
    address public relayer = makeAddr("relayer");
    address public registeredWallet = makeAddr("registeredWallet");
    address public unregisteredWallet = makeAddr("unregisteredWallet");

    bytes32 constant PHONE_HASH = keccak256("secret:+254712345678");

    function setUp() public {
        entryPoint = new MockEntryPoint();
        registry = new AutopayRegistry(admin, relayer);
        paymaster = new AutopayPaymaster(IEntryPoint(address(entryPoint)), registry, admin, relayer);

        vm.prank(relayer);
        registry.registerWallet(PHONE_HASH, registeredWallet);
    }

    function _userOp(address sender) internal pure returns (UserOperation memory) {
        return UserOperation({
            sender: sender,
            nonce: 0,
            initCode: "",
            callData: "",
            callGasLimit: 0,
            verificationGasLimit: 0,
            preVerificationGas: 0,
            maxFeePerGas: 0,
            maxPriorityFeePerGas: 0,
            paymasterAndData: "",
            signature: ""
        });
    }

    // ── Constructor ───────────────────────────────────────────────────────────

    function test_constructor_revertsOnZeroRegistry() public {
        vm.expectRevert(AutopayPaymaster.ZeroAddress.selector);
        new AutopayPaymaster(IEntryPoint(address(entryPoint)), AutopayRegistry(address(0)), admin, relayer);
    }

    function test_constructor_revertsOnZeroAdmin() public {
        vm.expectRevert(AutopayPaymaster.ZeroAddress.selector);
        new AutopayPaymaster(IEntryPoint(address(entryPoint)), registry, address(0), relayer);
    }

    // ── approveWallet ─────────────────────────────────────────────────────────

    function test_approveWallet_succeedsForRegisteredWallet() public {
        vm.prank(relayer);
        paymaster.approveWallet(registeredWallet);
        assertTrue(paymaster.sponsoredWallets(registeredWallet));
    }

    function test_approveWallet_revertsForUnregisteredWallet() public {
        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(AutopayPaymaster.WalletNotRegistered.selector, unregisteredWallet)
        );
        paymaster.approveWallet(unregisteredWallet);
    }

    function test_approveWallet_revertsForStranger() public {
        vm.prank(unregisteredWallet);
        vm.expectRevert();
        paymaster.approveWallet(registeredWallet);
    }

    function test_batchApproveWallets_skipsUnregistered() public {
        address[] memory wallets = new address[](2);
        wallets[0] = registeredWallet;
        wallets[1] = unregisteredWallet;

        vm.prank(relayer);
        paymaster.batchApproveWallets(wallets);

        assertTrue(paymaster.sponsoredWallets(registeredWallet));
        assertFalse(paymaster.sponsoredWallets(unregisteredWallet));
    }

    // ── validatePaymasterUserOp ───────────────────────────────────────────────

    function test_validatePaymasterUserOp_revertsIfNotEntryPoint() public {
        vm.prank(relayer);
        paymaster.approveWallet(registeredWallet);

        vm.expectRevert(AutopayPaymaster.NotEntryPoint.selector);
        paymaster.validatePaymasterUserOp(_userOp(registeredWallet), bytes32(0), 1000);
    }

    function test_validatePaymasterUserOp_revertsIfNotSponsored() public {
        vm.prank(address(entryPoint));
        vm.expectRevert(
            abi.encodeWithSelector(AutopayPaymaster.WalletNotSponsored.selector, registeredWallet)
        );
        paymaster.validatePaymasterUserOp(_userOp(registeredWallet), bytes32(0), 1000);
    }

    function test_validatePaymasterUserOp_revertsOverGasLimit() public {
        vm.prank(relayer);
        paymaster.approveWallet(registeredWallet);

        uint256 max = paymaster.maxGasPerOp();
        uint256 tooMuch = max + 1;
        vm.prank(address(entryPoint));
        vm.expectRevert(
            abi.encodeWithSelector(AutopayPaymaster.GasLimitExceeded.selector, tooMuch, max)
        );
        paymaster.validatePaymasterUserOp(_userOp(registeredWallet), bytes32(0), tooMuch);
    }

    function test_validatePaymasterUserOp_succeedsWithinLimits() public {
        vm.prank(relayer);
        paymaster.approveWallet(registeredWallet);

        vm.prank(address(entryPoint));
        (, uint256 validationData) =
            paymaster.validatePaymasterUserOp(_userOp(registeredWallet), bytes32(0), 1000);
        assertEq(validationData, 0);
    }

    // ── Daily sponsorship cap ─────────────────────────────────────────────────

    function test_dailySponsorshipLimit_blocksOverCap() public {
        vm.prank(relayer);
        paymaster.approveWallet(registeredWallet);

        vm.prank(admin);
        paymaster.setDailySponsorshipLimit(1500);

        vm.prank(address(entryPoint));
        paymaster.validatePaymasterUserOp(_userOp(registeredWallet), bytes32(0), 1000);

        vm.prank(address(entryPoint));
        vm.expectRevert();
        paymaster.validatePaymasterUserOp(_userOp(registeredWallet), bytes32(0), 1000);
    }

    function test_dailySponsorshipLimit_zeroMeansUnlimited() public {
        vm.prank(relayer);
        paymaster.approveWallet(registeredWallet);
        // dailySponsorshipLimit defaults to 0 — no cap.
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(address(entryPoint));
            paymaster.validatePaymasterUserOp(_userOp(registeredWallet), bytes32(0), 1000);
        }
    }

    // ── Pausable ──────────────────────────────────────────────────────────────

    function test_pause_blocksValidation() public {
        vm.prank(relayer);
        paymaster.approveWallet(registeredWallet);

        vm.prank(admin);
        paymaster.pause();

        vm.prank(address(entryPoint));
        vm.expectRevert();
        paymaster.validatePaymasterUserOp(_userOp(registeredWallet), bytes32(0), 1000);
    }

    function test_pause_revertsForRelayer() public {
        vm.prank(relayer);
        vm.expectRevert();
        paymaster.pause();
    }

    // ── Deposit management ────────────────────────────────────────────────────

    function test_deposit_byRelayer() public {
        vm.deal(relayer, 1 ether);
        vm.prank(relayer);
        paymaster.deposit{value: 1 ether}();

        assertEq(paymaster.getDeposit(), 1 ether);
    }

    function test_withdrawDeposit_byAdmin() public {
        vm.deal(relayer, 1 ether);
        vm.prank(relayer);
        paymaster.deposit{value: 1 ether}();

        address payable recipient = payable(makeAddr("recipient"));
        vm.prank(admin);
        paymaster.withdrawDeposit(recipient, 1 ether);

        assertEq(recipient.balance, 1 ether);
    }

    function test_withdrawDeposit_revertsForRelayer() public {
        vm.prank(relayer);
        vm.expectRevert();
        paymaster.withdrawDeposit(payable(relayer), 1 ether);
    }
}
