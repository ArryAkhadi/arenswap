# Requirements Document

## Introduction

ArenSwap is a stablecoin swap interface on Arc Testnet that allows users to exchange USDC for EURC via the deployed ArenSwap contract (`0x936B1516B784C3E2CC064e645BEBB614781D13Bd`). Two critical defects currently prevent swaps from completing:

1. **Redundant approval transactions** — the frontend always fires an ERC-20 `approve` transaction on every swap attempt, even when the user already has sufficient allowance. This wastes gas and degrades UX.
2. **Zero EURC reserves** — the deployed ArenSwap contract holds no EURC, so every `swapUSDCToEURC` call reverts with "ArenSwap: insufficient EURC reserve".

This spec covers the fixes for both defects: an allowance-aware swap flow in the frontend and a Foundry liquidity-funding script in the contracts project.

## Glossary

- **ArenSwap_Contract**: The deployed ArenSwap smart contract at `0x936B1516B784C3E2CC064e645BEBB614781D13Bd` on Arc Testnet.
- **USDC_Contract**: The ERC-20 USDC token contract at `0x3600000000000000000000000000000000000000` on Arc Testnet (6 decimals).
- **EURC_Contract**: The ERC-20 EURC token contract at `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` on Arc Testnet (6 decimals).
- **useSwap_Hook**: The React hook in `app/hooks/useSwap.ts` that manages swap state and transaction orchestration.
- **SwapStatus**: The discriminated union type representing the current state of the swap flow in the frontend.
- **Allowance**: The amount of USDC that the user has pre-authorised the ArenSwap_Contract to spend on their behalf, as returned by `USDC_Contract.allowance(owner, spender)`.
- **MicroUnits**: The integer representation of a token amount scaled by 10^6 (e.g., 1 USDC = 1,000,000 MicroUnits).
- **FundLiquidity_Script**: The Foundry broadcast script at `script/FundLiquidity.s.sol` in the contracts project that seeds the ArenSwap_Contract with EURC (and optionally USDC) reserves.
- **Owner**: The wallet address that deployed the ArenSwap_Contract and holds the EURC balance to be deposited.
- **ERC20_ABI**: The minimal ABI fragment array in `app/lib/contracts.ts` used by the frontend to interact with ERC-20 token contracts.

---

## Requirements

### Requirement 1: Read Current USDC Allowance

**User Story:** As a user, I want the frontend to check my existing USDC allowance before initiating a swap, so that I am not prompted to approve tokens I have already approved.

#### Acceptance Criteria

1. THE `ERC20_ABI` SHALL include an `allowance(address owner, address spender) returns (uint256)` read function fragment.
2. WHEN a user's wallet is connected, THE `useSwap_Hook` SHALL read the current USDC allowance for the connected address against the ArenSwap_Contract using `useReadContract` on the USDC_Contract.
3. WHILE the allowance read is pending, THE `useSwap_Hook` SHALL treat the allowance as undefined and disable the swap action.
4. IF the allowance read returns an error, THEN THE `useSwap_Hook` SHALL treat the allowance as zero and proceed with the approval path.

---

### Requirement 2: Allowance-Aware Swap State Machine

**User Story:** As a user, I want the swap flow to skip the approval step when I already have sufficient allowance, so that I can complete swaps in a single transaction when possible.

#### Acceptance Criteria

1. THE `SwapStatus` type SHALL include a `'needs-approval'` state in addition to the existing states (`'idle'`, `'approving'`, `'approved'`, `'swapping'`, `'success'`, `'error'`).
2. WHEN `executeSwap` is called with a valid USDC amount and the current Allowance is greater than or equal to the encoded MicroUnits amount, THE `useSwap_Hook` SHALL transition directly to `'swapping'` and fire `swapUSDCToEURC` without firing an `approve` transaction.
3. WHEN `executeSwap` is called with a valid USDC amount and the current Allowance is less than the encoded MicroUnits amount, THE `useSwap_Hook` SHALL transition to `'needs-approval'` and then to `'approving'` before firing the `approve` transaction.
4. WHEN the `approve` transaction confirms successfully and the status is `'approving'`, THE `useSwap_Hook` SHALL automatically transition to `'approved'` and then fire `swapUSDCToEURC` without requiring further user interaction.
5. IF `executeSwap` is called while the allowance value is still loading, THEN THE `useSwap_Hook` SHALL not initiate any transaction.

---

### Requirement 3: Expose Approval State to the UI

**User Story:** As a user, I want the swap button to accurately reflect whether I need to approve USDC or can swap directly, so that I understand what action I am authorising.

#### Acceptance Criteria

1. THE `UseSwapReturn` interface SHALL expose a `needsApproval` boolean field that is `true` when the current Allowance is less than the encoded MicroUnits amount for the entered USDC value, and `false` otherwise.
2. WHEN `needsApproval` is `true` and no transaction is in flight, THE swap button in `page.tsx` SHALL display "Approve USDC".
3. WHEN `needsApproval` is `false` and no transaction is in flight, THE swap button in `page.tsx` SHALL display "Swap".
4. WHILE the status is `'approving'`, THE swap button in `page.tsx` SHALL display "Approving USDC…" and be disabled.
5. WHILE the status is `'swapping'`, THE swap button in `page.tsx` SHALL display "Swapping…" and be disabled.

---

### Requirement 4: Allowance Check Correctness

**User Story:** As a developer, I want the allowance comparison to be performed in MicroUnits using bigint arithmetic, so that floating-point rounding errors cannot cause incorrect approval decisions.

#### Acceptance Criteria

1. THE `useSwap_Hook` SHALL compare the Allowance value and the encoded MicroUnits amount using `bigint` comparison operators, not floating-point arithmetic.
2. WHEN the entered USDC amount is empty or zero, THE `useSwap_Hook` SHALL treat the required allowance as zero and `needsApproval` SHALL be `false`.
3. FOR ALL valid USDC input strings, the `encodeUsdcAmount` function SHALL produce a `bigint` MicroUnits value that equals `Math.floor(parseFloat(input) * 1_000_000)` cast to `BigInt`.

---

### Requirement 5: FundLiquidity Foundry Script

**User Story:** As the contract owner, I want a Foundry broadcast script that approves and deposits EURC (and optionally USDC) into the ArenSwap_Contract in a single command, so that the contract has sufficient reserves to fulfil swap requests.

#### Acceptance Criteria

1. THE `FundLiquidity_Script` SHALL be located at `script/FundLiquidity.s.sol` in the contracts project and SHALL compile successfully with `forge build`.
2. THE `FundLiquidity_Script` SHALL import `forge-std/Script.sol` and declare a contract that extends `Script`.
3. THE `FundLiquidity_Script` SHALL declare the following compile-time constants:
   - `ARENSWAP` = `0x936B1516B784C3E2CC064e645BEBB614781D13Bd`
   - `EURC` = `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`
   - `USDC` = `0x3600000000000000000000000000000000000000`
   - `DEPOSIT_EURC_AMOUNT` = `1_000_000_000` (1000 EURC in MicroUnits)
   - `DEPOSIT_USDC_AMOUNT` = `1_000_000_000` (1000 USDC in MicroUnits)
4. THE `FundLiquidity_Script` SHALL implement a `run()` function that wraps all transactions in `vm.startBroadcast()` / `vm.stopBroadcast()`.
5. WHEN `run()` is executed, THE `FundLiquidity_Script` SHALL call `IERC20(EURC).approve(ARENSWAP, DEPOSIT_EURC_AMOUNT)` before calling `depositEURC(DEPOSIT_EURC_AMOUNT)` on the ArenSwap_Contract.
6. WHEN `run()` is executed, THE `FundLiquidity_Script` SHALL call `IERC20(USDC).approve(ARENSWAP, DEPOSIT_USDC_AMOUNT)` before calling `depositUSDC(DEPOSIT_USDC_AMOUNT)` on the ArenSwap_Contract.
7. THE `FundLiquidity_Script` SHALL use an `IERC20` interface that declares at minimum `approve(address spender, uint256 amount) returns (bool)`.
8. IF the `DEPOSIT_EURC_AMOUNT` or `DEPOSIT_USDC_AMOUNT` constants are changed, THEN THE `FundLiquidity_Script` SHALL use the updated values without requiring changes to the `run()` function body.

---

### Requirement 6: No Regression in Existing Swap Behaviour

**User Story:** As a user, I want the allowance-aware changes to preserve all existing swap behaviours, so that error handling, success toasts, and transaction hash reporting continue to work correctly.

#### Acceptance Criteria

1. WHEN a swap transaction confirms successfully, THE `useSwap_Hook` SHALL set status to `'success'` and expose the swap transaction hash via `successTxHash`.
2. IF the `approve` transaction is reverted, THEN THE `useSwap_Hook` SHALL set status to `'error'` and set the error message to `'Approval transaction was reverted'`.
3. IF the `swapUSDCToEURC` transaction is reverted, THEN THE `useSwap_Hook` SHALL set status to `'error'` and set the error message to `'Swap transaction was reverted'`.
4. WHEN `resetError` is called, THE `useSwap_Hook` SHALL set status to `'idle'` and clear the error message.
5. THE `useSwap_Hook` SHALL continue to expose `swapRate`, `isRateLoading`, and `isRateError` with unchanged semantics.
