# Tasks — swap-fix

## Task List

- [ ] 1. Add `allowance` fragment to `ERC20_ABI` in `app/lib/contracts.ts`
  - Append the `allowance(address owner, address spender) returns (uint256)` view function fragment to the `ERC20_ABI` array in `app/lib/contracts.ts`
  - The fragment must have `stateMutability: 'view'`, two address inputs (`owner`, `spender`), and one `uint256` output
  - The array must remain `as const` so wagmi can infer types
  - **File**: `app/lib/contracts.ts`
  - **Acceptance**: `ERC20_ABI` contains an entry with `name: 'allowance'` and the correct input/output shape

- [ ] 2. Update `app/hooks/useSwap.ts` — allowance-aware logic
  - **Depends on**: Task 1
  - [ ] 2.1 Add `useReadContract` for `allowance`
    - Destructure `address` from `useAccount()` (the hook already calls `useAccount()` but discards the result — update to capture `address`)
    - Add a `useReadContract` call for `USDC_ADDRESS` / `allowance` with `args: [address, ARENSWAP_ADDRESS]`
    - Enable the query only when `address` is defined (`query: { enabled: !!address }`)
    - Capture `data` as `allowance: bigint | undefined` and `isLoading` as `isAllowanceLoading: boolean`
  - [ ] 2.2 Add `'needs-approval'` to `SwapStatus`
    - Add `'needs-approval'` as a valid variant of the `SwapStatus` union type
  - [ ] 2.3 Add `needsApproval` boolean to `UseSwapReturn` and compute it
    - Add `needsApproval: boolean` to the `UseSwapReturn` interface
    - Compute `needsApproval` as a derived value (not state): `false` when amount is empty/zero; `true` when allowance is loading or undefined and amount is non-zero; `allowance < encodedAmount` otherwise
    - The hook needs access to the current `payAmount` — accept it as a parameter OR compute `needsApproval` inside the hook using the captured amount; the simplest approach is to compute it from a `usdcAmount` parameter passed to the hook, or expose the raw `allowance` and let the caller compute it. **Preferred**: keep the hook self-contained by accepting `usdcAmount: string` as a hook parameter so `needsApproval` can be computed internally
    - Return `needsApproval` in the hook's return object
  - [ ] 2.4 Update `executeSwap` to check allowance before deciding approve vs direct swap
    - If `isAllowanceLoading` or `allowance === undefined` → return early (no-op)
    - If `allowance >= encoded` → set status `'swapping'`, fire `swapWrite.writeContract` for `swapUSDCToEURC` directly (skip approve)
    - If `allowance < encoded` → set status `'needs-approval'`, then immediately set status `'approving'`, fire `approveWrite.writeContract` for `approve` (existing path)
    - All existing effects (approval receipt → `'approved'` → fire swap, swap receipt → `'success'`/`'error'`, write error handlers) remain **unchanged**
  - **Files**: `app/hooks/useSwap.ts`
  - **Acceptance**: Hook returns `needsApproval` boolean; `executeSwap` skips approve when allowance is sufficient; `executeSwap` is a no-op when allowance is loading

- [ ] 3. Update `app/page.tsx` — button label for "Approve USDC" vs "Swap"
  - **Depends on**: Task 2
  - Destructure `needsApproval` from the `useSwap()` call in `SwapCard`
  - If `useSwap` now accepts `usdcAmount` as a parameter (per Task 2.3), pass `payAmount` to it
  - In the button state machine, after the `status === 'swapping'` branch and before the amount-encoding block, add:
    - When `needsApproval === true` (and no in-flight tx): `buttonLabel = 'Approve USDC'`
    - When `needsApproval === false` (and no in-flight tx, amount is valid): `buttonLabel = 'Swap'`
  - The existing "Approving USDC…" and "Swapping…" spinner branches are **unchanged**
  - **File**: `app/page.tsx`
  - **Acceptance**: Button shows "Approve USDC" when allowance is insufficient and no tx is in flight; shows "Swap" when allowance is sufficient

- [ ] 4. Create `script/FundLiquidity.s.sol` in `arenswap-contracts`
  - **Independent** (no dependency on tasks 1–3)
  - Create the file at `script/FundLiquidity.s.sol` inside the `arenswap-contracts` project directory
  - The contract must:
    - Use `pragma solidity ^0.8.20` and `SPDX-License-Identifier: MIT`
    - Import `forge-std/Script.sol` and `../src/ArenSwap.sol`
    - Declare `IERC20Minimal` interface with `approve(address spender, uint256 amount) external returns (bool)`
    - Declare `FundLiquidityScript is Script` with compile-time constants:
      - `ARENSWAP = 0x936B1516B784C3E2CC064e645BEBB614781D13Bd`
      - `EURC     = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`
      - `USDC     = 0x3600000000000000000000000000000000000000`
      - `DEPOSIT_EURC_AMOUNT = 1_000_000_000`
      - `DEPOSIT_USDC_AMOUNT = 1_000_000_000`
    - Implement `run() external` wrapped in `vm.startBroadcast()` / `vm.stopBroadcast()`
    - Inside `run()`: approve then `depositEURC` for EURC; approve then `depositUSDC` for USDC
  - **File**: `d:\arenswap-contracts\script\FundLiquidity.s.sol`
  - **Acceptance**: File exists at the correct path with the specified content

- [ ] 5. Checkpoint: `npm run build` passes in `arenswap-frontend`
  - **Depends on**: Tasks 1, 2, 3
  - Run `npm run build` from `d:\arenswap-frontend\`
  - Build must exit with code 0 (no TypeScript errors, no Next.js build errors)
  - Fix any type errors introduced by the new `needsApproval` field, updated `SwapStatus`, or hook signature changes before marking complete
  - **Acceptance**: `npm run build` exits 0

- [ ] 6. Checkpoint: `forge build` passes in `arenswap-contracts`
  - **Depends on**: Task 4
  - Run `forge build` from `d:\arenswap-contracts\`
  - Build must exit with code 0 (no Solidity compilation errors)
  - **Acceptance**: `forge build` exits 0
