// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/ArenSwap.sol";

contract ArenSwapScript is Script {
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant EURC = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;
    uint256 constant INITIAL_SWAP_RATE = 921500; // 0.9215 EURC per USDC

    function run() external {
        vm.startBroadcast();
        ArenSwap arenSwap = new ArenSwap(USDC, EURC);
        arenSwap.setSwapRate(INITIAL_SWAP_RATE);
        vm.stopBroadcast();
    }
}
