// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/ArenSwap.sol";
import "./mocks/MockERC20.sol";

contract ArenSwapTest is Test {
    ArenSwap public arenSwap;
    MockERC20 public mockUsdc;
    MockERC20 public mockEurc;

    address public owner;
    address public user;

    uint256 constant SWAP_RATE    = 921_500;
    uint256 constant RESERVE_SIZE = 1_000_000e6;

    // Mirror events from ArenSwap for vm.expectEmit (required in Solidity 0.8.20)
    event Swapped(
        address indexed caller,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );
    event LiquidityDeposited(address indexed token, uint256 amount);

    function setUp() public {
        owner = address(this);
        user  = makeAddr("user");

        mockUsdc = new MockERC20("USD Coin", "USDC", 6);
        mockEurc = new MockERC20("Euro Coin", "EURC", 6);
        arenSwap = new ArenSwap(address(mockUsdc), address(mockEurc));

        // Seed contract reserves
        mockUsdc.mint(address(arenSwap), RESERVE_SIZE);
        mockEurc.mint(address(arenSwap), RESERVE_SIZE);

        // Set swap rate
        arenSwap.setSwapRate(SWAP_RATE);

        // Give user tokens
        mockUsdc.mint(user, RESERVE_SIZE);
        mockEurc.mint(user, RESERVE_SIZE);

        // User approvals
        vm.prank(user);
        mockUsdc.approve(address(arenSwap), type(uint256).max);
        vm.prank(user);
        mockEurc.approve(address(arenSwap), type(uint256).max);
    }

    // -------------------------------------------------------------------------
    // Task 6.2 -- Happy paths
    // -------------------------------------------------------------------------

    function test_swapUSDCToEURC_happyPath() public {
        uint256 usdcIn = 1000e6;
        uint256 expectedEurcOut = usdcIn * SWAP_RATE / 1e6;

        uint256 eurcBefore = mockEurc.balanceOf(user);
        uint256 usdcBefore = mockUsdc.balanceOf(user);

        vm.prank(user);
        arenSwap.swapUSDCToEURC(usdcIn);

        assertEq(mockEurc.balanceOf(user) - eurcBefore, expectedEurcOut);
        assertEq(usdcBefore - mockUsdc.balanceOf(user), usdcIn);
    }

    function test_swapEURCToUSDC_happyPath() public {
        uint256 eurcIn = 1000e6;
        uint256 expectedUsdcOut = eurcIn * 1e6 / SWAP_RATE;

        uint256 usdcBefore = mockUsdc.balanceOf(user);
        uint256 eurcBefore = mockEurc.balanceOf(user);

        vm.prank(user);
        arenSwap.swapEURCToUSDC(eurcIn);

        assertEq(mockUsdc.balanceOf(user) - usdcBefore, expectedUsdcOut);
        assertEq(eurcBefore - mockEurc.balanceOf(user), eurcIn);
    }

    // -------------------------------------------------------------------------
    // Task 6.3 -- Revert cases
    // -------------------------------------------------------------------------

    function test_swapUSDCToEURC_zeroAmount_reverts() public {
        vm.prank(user);
        vm.expectRevert("ArenSwap: amount must be greater than zero");
        arenSwap.swapUSDCToEURC(0);
    }

    function test_swapEURCToUSDC_zeroAmount_reverts() public {
        vm.prank(user);
        vm.expectRevert("ArenSwap: amount must be greater than zero");
        arenSwap.swapEURCToUSDC(0);
    }

    function test_swapUSDCToEURC_insufficientReserve_reverts() public {
        // eurcOut = usdcAmount * SWAP_RATE / 1e6 > RESERVE_SIZE
        // => usdcAmount > RESERVE_SIZE * 1e6 / SWAP_RATE
        uint256 bigAmount = RESERVE_SIZE * 1e6 / SWAP_RATE + 1e6;
        mockUsdc.mint(user, bigAmount);

        vm.prank(user);
        vm.expectRevert("ArenSwap: insufficient EURC reserve");
        arenSwap.swapUSDCToEURC(bigAmount);
    }

    function test_swapEURCToUSDC_insufficientReserve_reverts() public {
        // usdcOut = eurcAmount * 1e6 / SWAP_RATE > RESERVE_SIZE
        // => eurcAmount > RESERVE_SIZE * SWAP_RATE / 1e6
        uint256 bigAmount = RESERVE_SIZE * SWAP_RATE / 1e6 + 1e6;
        mockEurc.mint(user, bigAmount);

        vm.prank(user);
        vm.expectRevert("ArenSwap: insufficient USDC reserve");
        arenSwap.swapEURCToUSDC(bigAmount);
    }

    function test_swapUSDCToEURC_noApproval_reverts() public {
        vm.prank(user);
        mockUsdc.approve(address(arenSwap), 0);

        vm.prank(user);
        vm.expectRevert();
        arenSwap.swapUSDCToEURC(1000e6);
    }

    function test_swapUSDCToEURC_zeroRate_reverts() public {
        // Deploy a fresh ArenSwap with no rate set (swapRate == 0)
        ArenSwap freshSwap = new ArenSwap(address(mockUsdc), address(mockEurc));
        mockEurc.mint(address(freshSwap), RESERVE_SIZE);

        vm.prank(user);
        vm.expectRevert("ArenSwap: swap rate not set");
        freshSwap.swapUSDCToEURC(1000e6);
    }

    function test_setSwapRate_zeroRate_reverts() public {
        vm.expectRevert("ArenSwap: rate must be greater than zero");
        arenSwap.setSwapRate(0);
    }

    // -------------------------------------------------------------------------
    // Task 6.4 -- Events
    // -------------------------------------------------------------------------

    function test_swapUSDCToEURC_emitsSwapped() public {
        uint256 usdcIn = 1000e6;
        uint256 expectedEurcOut = usdcIn * SWAP_RATE / 1e6;

        vm.expectEmit(true, true, true, true);
        emit Swapped(user, address(mockUsdc), address(mockEurc), usdcIn, expectedEurcOut);

        vm.prank(user);
        arenSwap.swapUSDCToEURC(usdcIn);
    }

    function test_swapEURCToUSDC_emitsSwapped() public {
        uint256 eurcIn = 1000e6;
        uint256 expectedUsdcOut = eurcIn * 1e6 / SWAP_RATE;

        vm.expectEmit(true, true, true, true);
        emit Swapped(user, address(mockEurc), address(mockUsdc), eurcIn, expectedUsdcOut);

        vm.prank(user);
        arenSwap.swapEURCToUSDC(eurcIn);
    }

    function test_depositUSDC_emitsLiquidityDeposited() public {
        uint256 amount = 500e6;
        mockUsdc.mint(owner, amount);
        mockUsdc.approve(address(arenSwap), amount);

        vm.expectEmit(true, true, true, true);
        emit LiquidityDeposited(address(mockUsdc), amount);

        arenSwap.depositUSDC(amount);
    }

    function test_depositEURC_emitsLiquidityDeposited() public {
        uint256 amount = 500e6;
        mockEurc.mint(owner, amount);
        mockEurc.approve(address(arenSwap), amount);

        vm.expectEmit(true, true, true, true);
        emit LiquidityDeposited(address(mockEurc), amount);

        arenSwap.depositEURC(amount);
    }

    // -------------------------------------------------------------------------
    // Tasks 6.5, 6.6, 6.7 -- Fuzz / property-based tests
    // -------------------------------------------------------------------------

    // Feature: arenswap-contracts, Property 1: USDC->EURC output formula
    // Validates: Requirements 1.1, 2.1, 2.5, 8.1
    function testFuzz_swapUSDCToEURC_outputFormula(uint256 usdcAmount) public {
        vm.assume(usdcAmount > 0);
        vm.assume(usdcAmount <= type(uint128).max);
        uint256 expectedEurcOut = usdcAmount * SWAP_RATE / 1e6;
        vm.assume(expectedEurcOut > 0);
        vm.assume(expectedEurcOut <= RESERVE_SIZE);
        // ensure user has enough USDC
        mockUsdc.mint(user, usdcAmount);

        uint256 eurcBefore = mockEurc.balanceOf(user);
        uint256 usdcBefore = mockUsdc.balanceOf(user);

        vm.prank(user);
        arenSwap.swapUSDCToEURC(usdcAmount);

        assertEq(mockEurc.balanceOf(user) - eurcBefore, expectedEurcOut);
        assertEq(usdcBefore - mockUsdc.balanceOf(user), usdcAmount);
    }

    // Feature: arenswap-contracts, Property 2: EURC->USDC output formula
    // Validates: Requirements 1.2, 2.2, 8.2
    function testFuzz_swapEURCToUSDC_outputFormula(uint256 eurcAmount) public {
        vm.assume(eurcAmount > 0);
        vm.assume(eurcAmount <= type(uint128).max);
        uint256 expectedUsdcOut = eurcAmount * 1e6 / SWAP_RATE;
        vm.assume(expectedUsdcOut > 0);
        vm.assume(expectedUsdcOut <= RESERVE_SIZE);
        mockEurc.mint(user, eurcAmount);

        uint256 usdcBefore = mockUsdc.balanceOf(user);
        uint256 eurcBefore = mockEurc.balanceOf(user);

        vm.prank(user);
        arenSwap.swapEURCToUSDC(eurcAmount);

        assertEq(mockUsdc.balanceOf(user) - usdcBefore, expectedUsdcOut);
        assertEq(eurcBefore - mockEurc.balanceOf(user), eurcAmount);
    }

    // Feature: arenswap-contracts, Property 3: non-owner calls to owner-protected functions always revert
    // Validates: Requirements 3.3, 3.4, 5.3, 5.4, 6.2
    function testFuzz_ownerProtected_nonOwnerReverts(address caller, uint256 amount, uint256 newRate) public {
        vm.assume(caller != owner);
        vm.assume(caller != address(0));
        vm.assume(amount > 0);
        vm.assume(newRate > 0);

        vm.startPrank(caller);

        vm.expectRevert("ArenSwap: caller is not the owner");
        arenSwap.setSwapRate(newRate);

        vm.expectRevert("ArenSwap: caller is not the owner");
        arenSwap.depositUSDC(amount);

        vm.expectRevert("ArenSwap: caller is not the owner");
        arenSwap.depositEURC(amount);

        vm.expectRevert("ArenSwap: caller is not the owner");
        arenSwap.withdrawUSDC(amount);

        vm.expectRevert("ArenSwap: caller is not the owner");
        arenSwap.withdrawEURC(amount);

        vm.stopPrank();
    }
}
