// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/TumaSmartWallet.sol";
import "../src/TumaWalletFactory.sol";
import "../src/interfaces/IEntryPoint.sol";
import "../src/interfaces/UserOperation.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Minimal mock for EntryPoint (we just need depositTo/balanceOf)
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

    receive() external payable {}
}

contract MockERC20 is ERC20 {
    constructor() ERC20("Mock", "MCK") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract TumaSmartWalletTest is Test {
    MockEntryPoint public entryPoint;
    TumaWalletFactory public factory;
    TumaSmartWallet public wallet;

    uint256 ownerKey = 0xB0B;
    address owner    = vm.addr(ownerKey);
    address guardian = makeAddr("guardian");
    address admin    = makeAddr("admin");
    address alice    = makeAddr("alice");

    bytes32 PHONE_HASH = keccak256("test:+254712345678");
    MockERC20 token;

    function setUp() public {
        entryPoint = new MockEntryPoint();

        factory = new TumaWalletFactory(
            IEntryPoint(address(entryPoint)),
            guardian,
            admin,
            guardian  // guardian also acts as relayer in tests
        );

        // Deploy a wallet
        vm.prank(guardian);
        address walletAddr = factory.createWallet(owner, PHONE_HASH);
        wallet = TumaSmartWallet(payable(walletAddr));

        // Fund the wallet
        vm.deal(address(wallet), 10 ether);
        token = new MockERC20();
        token.mint(address(wallet), 1000e18);
    }

    // ── Initialization ────────────────────────────────────────────────────────

    function test_initializedCorrectly() public view {
        assertEq(wallet.owner(), owner);
        assertEq(wallet.guardian(), guardian);
        assertTrue(wallet.initialized());
    }

    function test_cannotInitializeTwice() public {
        vm.expectRevert(TumaSmartWallet.AlreadyInitialized.selector);
        wallet.initialize(alice, guardian);
    }

    // ── Factory determinism ───────────────────────────────────────────────────

    function test_addressDeterminism() public view {
        address predicted = factory.getWalletAddress(owner, PHONE_HASH);
        assertEq(predicted, address(wallet));
    }

    function test_idempotentDeploy() public {
        vm.prank(guardian);
        address second = factory.createWallet(owner, PHONE_HASH);
        assertEq(second, address(wallet)); // same address returned
    }

    // ── execute ───────────────────────────────────────────────────────────────

    function test_execute_ownerCanCall() public {
        uint256 balBefore = alice.balance;

        vm.prank(owner);
        wallet.execute(alice, 1 ether, "");

        assertEq(alice.balance, balBefore + 1 ether);
    }

    function test_execute_guardianCanCall() public {
        uint256 balBefore = alice.balance;

        vm.prank(guardian);
        wallet.execute(alice, 0.5 ether, "");

        assertEq(alice.balance, balBefore + 0.5 ether);
    }

    function test_execute_strangerReverts() public {
        vm.prank(alice);
        vm.expectRevert(TumaSmartWallet.NotAuthorized.selector);
        wallet.execute(alice, 1 ether, "");
    }

    // ── executeBatch ──────────────────────────────────────────────────────────

    function test_executeBatch() public {
        address bob = makeAddr("bob");

        address[] memory targets = new address[](2);
        uint256[] memory values  = new uint256[](2);
        bytes[] memory datas     = new bytes[](2);

        targets[0] = alice; values[0] = 1 ether; datas[0] = "";
        targets[1] = bob;   values[1] = 2 ether; datas[1] = "";

        vm.prank(owner);
        wallet.executeBatch(targets, values, datas);

        assertEq(alice.balance, 1 ether);
        assertEq(bob.balance, 2 ether);
    }

    // ── transferToken ─────────────────────────────────────────────────────────

    function test_transferToken_success() public {
        vm.prank(guardian);
        wallet.transferToken(address(token), alice, 100e18);

        assertEq(token.balanceOf(alice), 100e18);
        assertEq(token.balanceOf(address(wallet)), 900e18);
    }

    function test_transferToken_revertsForStranger() public {
        vm.prank(alice);
        vm.expectRevert(TumaSmartWallet.NotAuthorized.selector);
        wallet.transferToken(address(token), alice, 100e18);
    }

    // ── updateOwner ───────────────────────────────────────────────────────────

    function test_updateOwner_byGuardian() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(guardian);
        wallet.updateOwner(newOwner);

        assertEq(wallet.owner(), newOwner);
    }

    function test_updateOwner_byOwner() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(owner);
        wallet.updateOwner(newOwner);

        assertEq(wallet.owner(), newOwner);
    }

    function test_updateOwner_revertsForStranger() public {
        vm.prank(alice);
        vm.expectRevert(TumaSmartWallet.NotAuthorized.selector);
        wallet.updateOwner(alice);
    }

    // ── updateGuardian ────────────────────────────────────────────────────────

    function test_updateGuardian_byGuardian() public {
        address newGuardian = makeAddr("newGuardian");

        vm.prank(guardian);
        wallet.updateGuardian(newGuardian);

        assertEq(wallet.guardian(), newGuardian);
    }

    function test_updateGuardian_revertsForOwner() public {
        vm.prank(owner);
        vm.expectRevert(TumaSmartWallet.NotAuthorized.selector);
        wallet.updateGuardian(alice);
    }

    // ── Receive AVAX ─────────────────────────────────────────────────────────

    function test_receivesAvax() public {
        uint256 before = address(wallet).balance;
        payable(address(wallet)).transfer(1 ether);
        assertEq(address(wallet).balance, before + 1 ether);
    }

    // ── Deposit management ────────────────────────────────────────────────────

    function test_addDeposit() public {
        vm.prank(owner);
        wallet.addDeposit{value: 1 ether}();

        assertEq(wallet.getDeposit(), 1 ether);
    }
}
