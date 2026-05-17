# Arenswap

Arenswap is a Next.js frontend for same-chain Circle Swap Kit swaps on Arc Testnet. The current stable implementation keeps Circle API access behind a server-side route, executes swaps with the connected wallet, and verifies success from real token balance changes and transfer logs.

## Project Structure

```text
arenswap/
  frontend/   Next.js app, wallet UI, Circle swap proxy route, Arc Testnet config
  contracts/  Foundry contracts workspace and tests
```

Vercel builds and deploys from `frontend/`.

## Frontend Development

Install dependencies and start the local app:

```bash
cd frontend
npm install
npm run dev
```

The app runs on the Next.js local dev URL shown in the terminal, usually `http://localhost:3000`.

Build the frontend:

```bash
cd frontend
npm run build
```

Run lint:

```bash
cd frontend
npm run lint
```

## Vercel Deployment

Use these Vercel project settings:

```text
Root Directory: frontend
Framework Preset: Next.js
Install Command: npm install
Build Command: npm run build
Output Directory: .next
```

Required Vercel environment variable:

```text
CIRCLE_KIT_KEY=KIT_KEY:...
```

`CIRCLE_KIT_KEY` is server-side only. Do not prefix it with `NEXT_PUBLIC_`, do not render it in the browser, and do not send it to the wallet. The frontend calls `frontend/app/api/circle/swap/route.ts`, and that server route calls Circle with the kit key.

Do not use private keys in this project. Swaps are executed by the connected user wallet only.

## Supported Swaps

Arenswap supports Arc Testnet swaps between:

- `USDC`
- `EURC`
- `cirBTC`

The app uses canonical Arc Testnet token addresses from the implementation. Do not replace them with placeholder or fake addresses.

## Wallet Flow

For ERC-20 inputs, the wallet may ask for two confirmations:

1. Approval, if the Circle Adapter Contract does not already have enough allowance.
2. Swap confirmation for the final Circle adapter execution transaction.

The app must not mark a swap successful just because a transaction was mined. A mined fee-only or incomplete transaction is not a successful swap.

## Verifying A Successful Swap

After the swap transaction is mined, the app keeps strict verification:

- The result card shows the submitted approval and swap transaction hashes when available.
- The Arcscan transaction link opens the final swap transaction.
- Transfer events are decoded from the receipt and tiny service or gas fee transfers are ignored.
- The input token balance must decrease by the real swap input amount.
- The output token balance must increase.

If the transaction confirms but those balance changes are not detected, the UI shows a warning instead of a fake success state.
