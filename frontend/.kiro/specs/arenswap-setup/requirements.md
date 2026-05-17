# Requirements Document

## Introduction

Arenswap is an onchain stablecoin FX swap platform enabling users to swap USDC for EURC on the Arc Network. This document covers the foundational project setup: installing and configuring the Web3 stack in the existing Next.js frontend, configuring the Arc Testnet chain, initializing a Foundry smart contract project, and scaffolding the core USDC-EURC swap contract.

The setup spans two sibling directories:
- `arenswap-frontend` — the existing Next.js 16 App Router project
- `arenswap-contracts` — a new Foundry project to be initialized alongside it

## Glossary

- **Frontend**: The Next.js 16 App Router application located in `arenswap-frontend/`
- **Contracts_Project**: The Foundry project to be initialized in `arenswap-contracts/`
- **Web3_Stack**: The combination of Wagmi, Viem, and RainbowKit libraries
- **Arc_Testnet**: The Arc Network test environment with Chain ID 5042002
- **Wagmi_Config**: The Wagmi configuration object that defines supported chains and transports
- **RainbowKit_Provider**: The RainbowKit React context provider that wraps the application
- **Web3_Provider**: The client-side React component that composes WagmiProvider and RainbowKitProvider, marked with `'use client'`
- **Swap_Contract**: The Solidity smart contract implementing the USDC-to-EURC swap mechanism
- **USDC**: USD Coin — the input token for swaps, also the native currency of the Arc Testnet
- **EURC**: Euro Coin — the output token for swaps
- **Foundry**: The Solidity development toolchain (forge, cast, anvil)
- **ERC20_Interface**: The standard ERC-20 token interface used to interact with USDC and EURC tokens

---

## Requirements

### Requirement 1: Install Web3 Dependencies

**User Story:** As a developer, I want Wagmi, Viem, and RainbowKit installed in the frontend project, so that I can build wallet-connected UI components.

#### Acceptance Criteria

1. THE Frontend SHALL have `wagmi`, `viem`, and `@rainbow-me/rainbowkit` listed under the `dependencies` field (not `devDependencies`) in `package.json`.
2. WHEN the dependency installation completes, THE Frontend SHALL produce no peer dependency errors or warnings for `wagmi`, `viem`, and `@rainbow-me/rainbowkit`, as indicated by the package manager exiting with a zero exit code and no peer dependency conflict output.
3. THE Frontend SHALL pin each of `wagmi`, `viem`, and `@rainbow-me/rainbowkit` to an exact version in `package.json` using no semver range operators (no `^`, `~`, `>`, `>=`, `*`, or `x`).

---

### Requirement 2: Configure Arc Testnet Chain

**User Story:** As a developer, I want the Arc Testnet defined as a custom Viem chain, so that Wagmi and RainbowKit can connect to it.

#### Acceptance Criteria

1. THE Wagmi_Config SHALL define a custom chain with the name `"Arc Testnet"`, Chain ID `5042002`, native currency name `"USD Coin"`, native currency symbol `"USDC"`, native currency decimals `6`, and block explorer URL `"https://testnet.arcscan.app"`.
2. THE Wagmi_Config SHALL use an HTTP transport pointed at the Arc Testnet public RPC endpoint `https://rpc.testnet.arcscan.app`.
3. THE Wagmi_Config SHALL be created using the `createConfig` function from Wagmi and exported from a dedicated configuration module at `app/lib/wagmi.ts`.
4. IF the Wagmi_Config module is imported in a server-side rendering context, THEN THE Frontend SHALL not call `window`, `document`, `localStorage`, or any other browser-global API at module evaluation time.

---

### Requirement 3: Create Web3 Provider Component

**User Story:** As a developer, I want a single client-side provider component that wraps the application with Wagmi and RainbowKit context, so that all child components can access wallet state.

#### Acceptance Criteria

1. THE Web3_Provider SHALL be a React Client Component declared with the `'use client'` directive as the first line of its file.
2. THE Web3_Provider SHALL compose `QueryClientProvider` (outermost), `WagmiProvider`, and `RainbowKitProvider` (innermost) in that nesting order, with `WagmiProvider` receiving the exported `Wagmi_Config` via its `config` prop.
3. THE Web3_Provider SHALL instantiate a `QueryClient` from `@tanstack/react-query` and pass it to `QueryClientProvider` via its `client` prop.
4. THE Web3_Provider SHALL accept a `children` prop of type `React.ReactNode` and render it as the child of `RainbowKitProvider`.
5. THE Web3_Provider SHALL be the default export from `app/providers/Web3Provider.tsx`.
6. WHEN `RainbowKitProvider` is rendered, THE Web3_Provider SHALL pass `coolTheme()` (invoked as a function call) to the `theme` prop of `RainbowKitProvider`.

---

### Requirement 4: Integrate Web3 Provider into Root Layout

**User Story:** As a developer, I want the Web3 provider mounted in the root layout, so that wallet connectivity is available on every page without converting the layout to a Client Component.

#### Acceptance Criteria

1. THE Frontend SHALL import `Web3Provider` from `app/providers/Web3Provider.tsx` into `app/layout.tsx` and use it as the sole wrapper around `{children}` inside the `<body>` element, leaving `layout.tsx` as a Server Component.
2. WHEN `Web3Provider` is rendered inside `layout.tsx`, THE Frontend SHALL NOT contain the `'use client'` directive anywhere in `layout.tsx`.
3. THE Frontend SHALL preserve the `metadata` named export, the `geistSans` font variable with its `--font-geist-sans` CSS variable, and the `geistMono` font variable with its `--font-geist-mono` CSS variable in `layout.tsx` after the integration.

---

### Requirement 5: Initialize Foundry Contracts Project

**User Story:** As a developer, I want a Foundry project initialized in `arenswap-contracts/`, so that I have a standard Solidity development environment for the swap contracts.

#### Acceptance Criteria

1. THE Contracts_Project SHALL be initialized using `forge init` in a directory named `arenswap-contracts` that is a sibling of `arenswap-frontend`.
2. THE Contracts_Project SHALL contain the following non-empty directories after initialization: `src/`, `test/`, `script/`, `lib/`, and `lib/forge-std/`.
3. THE Contracts_Project SHALL include a `foundry.toml` configuration file at its root.
4. WHEN `forge build` is run inside `arenswap-contracts/`, THE Contracts_Project SHALL exit with code 0 and produce no compiler errors in its output.

---

### Requirement 6: Scaffold Swap Contract Structure

**User Story:** As a developer, I want a Solidity contract file scaffolded with the correct structure for the USDC-EURC swap, so that I have a clear starting point for implementing the swap logic.

#### Acceptance Criteria

1. THE Swap_Contract SHALL be located at `arenswap-contracts/src/ArenSwap.sol` and declare `pragma solidity ^0.8.20`.
2. THE Swap_Contract SHALL define an `IERC20` interface with `transfer`, `transferFrom`, `approve`, and `balanceOf` function signatures.
3. THE Swap_Contract SHALL declare `immutable` state variables for the USDC token address (`address public immutable usdc`) and the EURC token address (`address public immutable eurc`), both set via the constructor.
4. THE Swap_Contract SHALL declare a `swapRate` state variable of type `uint256` representing the number of EURC wei returned per 1 USDC wei.
5. THE Swap_Contract SHALL implement a `swap(uint256 usdcAmount)` function containing a `// TODO:` comment that describes the expected computation shape `usdcAmount × swapRate` as placeholder logic for future implementation.
6. WHEN `swap` is called with a `usdcAmount` of zero, THE Swap_Contract SHALL revert with an error message indicating that the amount must be greater than zero.
7. THE Swap_Contract SHALL implement an `owner` state variable and an `onlyOwner` modifier that reverts with an error message indicating that the caller is not the owner.
8. THE Swap_Contract SHALL include a `setSwapRate(uint256 newRate)` function protected by the `onlyOwner` modifier.
9. THE Swap_Contract constructor SHALL accept exactly two `address` parameters: the USDC token address and the EURC token address, in that order.

---

### Requirement 7: Scaffold Swap Contract Test

**User Story:** As a developer, I want a Foundry test file scaffolded for the swap contract, so that I have a baseline for writing unit tests.

#### Acceptance Criteria

1. THE Contracts_Project SHALL contain a test file at `arenswap-contracts/test/ArenSwap.t.sol` that imports `forge-std/Test.sol` using the path `"forge-std/Test.sol"` and imports `ArenSwap` using the path `"../src/ArenSwap.sol"`.
2. THE test file SHALL define a test contract that inherits from `Test` and includes a `setUp()` function with an empty body (no statements), serving as a stub for future test initialization.
3. THE test file SHALL include at least one test function prefixed with `test` that contains a placeholder body (e.g., a `// TODO:` comment), so that `forge test` has at least one test to discover.
4. WHEN `forge test` is run inside `arenswap-contracts/`, THE Contracts_Project SHALL exit with code 0 and produce no compiler errors in its output.

---

### Requirement 8: Scaffold Deployment Script

**User Story:** As a developer, I want a Foundry deployment script scaffolded for the swap contract, so that I have a starting point for deploying to Arc Testnet.

#### Acceptance Criteria

1. THE Contracts_Project SHALL contain a deployment script at `arenswap-contracts/script/ArenSwap.s.sol` that imports `forge-std/Script.sol` using the path `"forge-std/Script.sol"` and imports `ArenSwap` using the path `"../src/ArenSwap.sol"`.
2. THE deployment script SHALL define a contract inheriting from `Script` with a `run()` function that calls `vm.startBroadcast()`, instantiates a new `ArenSwap` contract with the placeholder constructor arguments, and then calls `vm.stopBroadcast()`.
3. THE deployment script SHALL declare the USDC address placeholder as `address usdcAddress = address(0); // TODO: replace with actual USDC address`, the EURC address placeholder as `address eurcAddress = address(0); // TODO: replace with actual EURC address`, and the initial swap rate placeholder as `uint256 initialSwapRate = 0; // TODO: replace with actual initial swap rate`, all clearly marked with `TODO` comments.
