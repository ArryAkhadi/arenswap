// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/ArenSwap.sol";

interface IERC20Minimal {
    function approve(address spender, uint256 amount) external returns (bool);
}

contract FundLiquidityScript is Script {
    address constant ARENSWAP = 0x936B1516B784C3E2CC064e645BEBB614781D13Bd;
    address constant EURC     = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;
    address constant USDC     = 0x3600000000000000000000000000000000000000;

    uint256 constant DEPOSIT_EURC_AMOUNT = 1_000_000_000; // 1000 EURC (6 decimals)
    uint256 constant DEPOSIT_USDC_AMOUNT = 1_000_000_000; // 1000 USDC (6 decimals)

    function run() external {
        vm.startBroadcast();

        // Approve and deposit EURC reserves
        IERC20Minimal(EURC).approve(ARENSWAP, DEPOSIT_EURC_AMOUNT);
        ArenSwap(ARENSWAP).depositEURC(DEPOSIT_EURC_AMOUNT);

        // Approve and deposit USDC reserves
        IERC20Minimal(USDC).approve(ARENSWAP, DEPOSIT_USDC_AMOUNT);
        ArenSwap(ARENSWAP).depositUSDC(DEPOSIT_USDC_AMOUNT);

        vm.stopBroadcast();
    }
}