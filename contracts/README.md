# ArenSwap Contracts

Foundry smart contracts for the Arenswap project, deployed on Arc Testnet.

## Contracts

- **ArenSwap.sol**  Main swap contract for USDC/EURC swaps on Arc Testnet
- **Counter.sol**  Example Foundry counter contract

## Deployed addresses (Arc Testnet)

| Contract | Address |
|---|---|
| ArenSwap | 0x936B1516B784C3E2CC064e645BEBB614781D13Bd |
| USDC | 0x3600000000000000000000000000000000000000 |
| EURC | 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a |

## Usage

### Build

`ash
forge build
`",
",


`ash
forge test
`",
",


`ash
forge fmt
`",
",


`ash
forge script script/ArenSwap.s.sol --rpc-url https://rpc.testnet.arc.network --broadcast
`",
",


- Foundry: https://book.getfoundry.sh
- Solidity 0.8.20
