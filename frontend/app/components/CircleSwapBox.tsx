'use client'

/**
 * CircleSwapBox — same-chain token swap on Arc Testnet via Circle Swap Kit.
 *
 * Architecture:
 *   1. Browser POSTs to /api/circle/swap (Next.js server route).
 *   2. The server calls Circle's createSwap API (no CORS issue server-side).
 *   3. The server returns the EVM transaction payload.
 *   4. The browser executes the on-chain approve + swap using the user's wallet.
 *
 * No private key is used. No Circle API key is exposed to the browser.
 */

import { useState } from 'react'
import { useAccount, useWalletClient, useChainId, useSwitchChain, usePublicClient } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { encodeFunctionData } from 'viem'

// ─── Constants ─────────────────────────────────────────────────────────────────

const ARC_TESTNET_CHAIN_ID = 5042002
const ARC_TESTNET_EXPLORER = 'https://testnet.arcscan.app'

const SUPPORTED_TOKENS = ['USDC', 'EURC', 'cirBTC'] as const
type SupportedToken = (typeof SUPPORTED_TOKENS)[number]

// Minimal ERC-20 ABI for approve
const ERC20_APPROVE_ABI = [
  {
    name: 'approve',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SwapTransaction {
  // EVM transaction instruction from Circle
  signature?: string
  executionParams?: {
    execId: string
    deadline: string
    metadata: string
    tokens: Array<{ token: string; beneficiary: string }>
    instructions: Array<{
      target: string
      data: string
      value: string
      tokenIn: string
      amountToApprove: string
      tokenOut: string
      minTokenOut: string
    }>
  }
  gasLimit?: string
}

interface ProxyResponse {
  ok: boolean
  tokenIn: string
  tokenOut: string
  amountIn: string
  amountBaseUnits: string
  estimatedAmount: string
  stopLimit: string
  fromAddress: string
  toAddress: string
  transaction: SwapTransaction
  fees: unknown
  error?: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function isValidAmount(value: string): boolean {
  const n = parseFloat(value)
  return value.trim() !== '' && isFinite(n) && n > 0
}

function isCorsOrFetchError(message: string): boolean {
  return (
    message.includes('Failed to fetch') ||
    message.includes('CORS') ||
    message.includes('x-user-agent') ||
    message.includes('Access-Control-Allow-Headers') ||
    message.includes('ERR_FAILED')
  )
}

// ─── Token selector ────────────────────────────────────────────────────────────

interface TokenSelectProps {
  label: string
  value: SupportedToken
  onChange: (v: SupportedToken) => void
  exclude?: SupportedToken
  disabled?: boolean
}

function TokenSelect({ label, value, onChange, exclude, disabled }: TokenSelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium uppercase tracking-wider text-white/40">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SupportedToken)}
        disabled={disabled}
        className="rounded-xl border border-white/[0.08] bg-white/[0.06] px-3 py-2.5 text-sm font-semibold text-white outline-none transition-colors hover:border-white/[0.14] focus:border-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={`Select ${label} token`}
      >
        {SUPPORTED_TOKENS.filter((t) => t !== exclude).map((t) => (
          <option key={t} value={t} className="bg-[#111318] text-white">
            {t}
          </option>
        ))}
      </select>
    </div>
  )
}

// ─── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function CircleSwapBox() {
  const { isConnected, address } = useAccount()
  const chainId = useChainId()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const { switchChain, isPending: isSwitching } = useSwitchChain()

  const [tokenIn, setTokenIn] = useState<SupportedToken>('USDC')
  const [tokenOut, setTokenOut] = useState<SupportedToken>('EURC')
  const [amountIn, setAmountIn] = useState('')
  const [status, setStatus] = useState<
    'idle' | 'requesting' | 'approving' | 'swapping' | 'success' | 'error'
  >('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [estimatedOut, setEstimatedOut] = useState<string | null>(null)

  const isOnArcTestnet = chainId === ARC_TESTNET_CHAIN_ID
  const isLoading = status === 'requesting' || status === 'approving' || status === 'swapping'

  // ─── Kit key validation (public env var — format check only) ─────────────────
  // The actual key lives in CIRCLE_KIT_KEY (server-only).
  // NEXT_PUBLIC_CIRCLE_KIT_KEY is optional and only used for client-side format hints.
  const publicKitKey = process.env.NEXT_PUBLIC_CIRCLE_KIT_KEY
  const kitKeyMissing = publicKitKey !== undefined && publicKitKey === ''
  const kitKeyInvalidFormat =
    publicKitKey !== undefined &&
    publicKitKey !== '' &&
    !publicKitKey.startsWith('KIT_KEY:')

  // ─── Validation ──────────────────────────────────────────────────────────────

  function getValidationError(): string | null {
    if (!isConnected) return 'Wallet not connected.'
    if (!isOnArcTestnet) return 'Please switch to Arc Testnet.'
    if (!walletClient) return 'Wallet client unavailable. Try reconnecting.'
    if (tokenIn === tokenOut) return 'tokenIn and tokenOut must be different.'
    if (!isValidAmount(amountIn)) return 'Enter a valid amount greater than zero.'
    return null
  }

  const validationError = getValidationError()
  const canSwap = validationError === null && !isLoading

  // ─── Reset ────────────────────────────────────────────────────────────────────

  function reset() {
    setError(null)
    setTxHash(null)
    setEstimatedOut(null)
    setStatus('idle')
  }

  // ─── Swap handler ─────────────────────────────────────────────────────────────

  async function handleSwap() {
    if (!canSwap || !walletClient || !address || !publicClient) return

    reset()
    setStatus('requesting')

    try {
      // ── Step 1: Ask the server to call Circle createSwap ──────────────────
      const res = await fetch('/api/circle/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenIn,
          tokenOut,
          amountIn,
          fromAddress: address,
          toAddress: address,
          chain: 'Arc_Testnet',
        }),
      })

      const data: ProxyResponse = await res.json()

      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Server error ${res.status}`)
      }

      setEstimatedOut(data.estimatedAmount)

      // ── Step 2: Execute on-chain transactions ─────────────────────────────
      // The Circle SDK returns an EVM transaction payload with instructions.
      // Each instruction contains: target, data, value, tokenIn, amountToApprove.
      const tx = data.transaction as SwapTransaction

      if (!tx?.executionParams?.instructions?.length) {
        throw new Error('Circle returned an empty transaction payload.')
      }

      for (const instruction of tx.executionParams.instructions) {
        const {
          target,
          data: calldata,
          value: hexValue,
          tokenIn: instrTokenIn,
          amountToApprove,
        } = instruction

        // Approve the token spend if required
        if (instrTokenIn && amountToApprove && BigInt(amountToApprove) > BigInt(0)) {
          setStatus('approving')

          const approveData = encodeFunctionData({
            abi: ERC20_APPROVE_ABI,
            functionName: 'approve',
            args: [target as `0x${string}`, BigInt(amountToApprove)],
          })

          const approveTx = await walletClient.sendTransaction({
            to: instrTokenIn as `0x${string}`,
            data: approveData,
            account: address,
            chain: walletClient.chain,
          })

          // Wait for approval to be mined
          await publicClient.waitForTransactionReceipt({ hash: approveTx })
        }

        // Execute the swap instruction
        setStatus('swapping')

        const txValue = hexValue && hexValue !== '0x' ? BigInt(hexValue) : BigInt(0)

        const swapTxHash = await walletClient.sendTransaction({
          to: target as `0x${string}`,
          data: calldata as `0x${string}`,
          value: txValue,
          account: address,
          chain: walletClient.chain,
        })

        setTxHash(swapTxHash)
        await publicClient.waitForTransactionReceipt({ hash: swapTxHash })
      }

      setStatus('success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.'

      if (isCorsOrFetchError(message)) {
        setError(
          'Circle Stablecoin Service is blocked by browser CORS. ' +
            'This deployment cannot call Circle swap endpoint directly from the browser. ' +
            'The app needs a supported server-side swap flow or a Circle SDK/API fix.',
        )
      } else {
        setError(message)
      }

      setStatus('error')
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-md">
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#111318] shadow-2xl shadow-black/60">
        {/* Top gradient accent */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(59,130,246,0.5) 40%, rgba(99,102,241,0.5) 60%, transparent)',
          }}
          aria-hidden="true"
        />

        <div className="p-5">
          {/* Header */}
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Swap</h2>
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400">
              Arc Testnet
            </span>
          </div>

          {/* Kit key missing banner (public env var hint) */}
          {kitKeyMissing && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <p className="text-xs font-semibold text-amber-400">
                Missing <code className="font-mono">NEXT_PUBLIC_CIRCLE_KIT_KEY</code>
              </p>
              <p className="mt-1 text-xs text-amber-300/80">
                Add it in Vercel Environment Variables and redeploy.
              </p>
            </div>
          )}

          {/* Kit key invalid format banner */}
          {kitKeyInvalidFormat && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
              <p className="text-xs font-semibold text-red-400">Invalid Circle Kit Key format</p>
              <p className="mt-1 text-xs text-red-300/80">
                Use an App Kit / Kit Key from Circle Console. Do not use a regular Circle API key.
              </p>
              <p className="mt-1 font-mono text-xs text-red-300/60">
                Expected: KIT_KEY:&#123;keyId&#125;:&#123;keySecret&#125;
              </p>
            </div>
          )}

          {/* Connect wallet prompt */}
          {!isConnected && (
            <div className="mb-4 flex flex-col items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-sm text-white/50">Connect your wallet to swap</p>
              <ConnectButton />
            </div>
          )}

          {/* Wrong chain warning */}
          {isConnected && !isOnArcTestnet && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <p className="mb-2 text-xs text-amber-400">
                Your wallet is on the wrong network. Switch to Arc Testnet to continue.
              </p>
              <button
                onClick={() => switchChain({ chainId: ARC_TESTNET_CHAIN_ID })}
                disabled={isSwitching}
                className="flex items-center gap-2 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSwitching && <Spinner />}
                Switch to Arc Testnet
              </button>
            </div>
          )}

          {/* Swap form */}
          <div className="flex flex-col gap-4">
            {/* Token selectors */}
            <div className="grid grid-cols-2 gap-3">
              <TokenSelect
                label="From"
                value={tokenIn}
                onChange={(v) => {
                  setTokenIn(v)
                  reset()
                }}
                exclude={tokenOut}
                disabled={isLoading}
              />
              <TokenSelect
                label="To"
                value={tokenOut}
                onChange={(v) => {
                  setTokenOut(v)
                  reset()
                }}
                exclude={tokenIn}
                disabled={isLoading}
              />
            </div>

            {/* Amount input */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="circle-amount-in"
                className="text-xs font-medium uppercase tracking-wider text-white/40"
              >
                Amount
              </label>
              <input
                id="circle-amount-in"
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amountIn}
                onChange={(e) => {
                  setAmountIn(e.target.value)
                  reset()
                }}
                disabled={isLoading}
                min="0"
                step="any"
                aria-label={`Amount of ${tokenIn} to swap`}
                className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-xl font-semibold text-white outline-none placeholder:text-white/20 transition-colors hover:border-white/[0.14] focus:border-blue-500/50 focus:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>

            {/* Status label */}
            {status === 'requesting' && (
              <p className="text-center text-xs text-white/40">
                Requesting swap quote from Circle…
              </p>
            )}
            {status === 'approving' && (
              <p className="text-center text-xs text-white/40">
                Approving token spend in your wallet…
              </p>
            )}
            {status === 'swapping' && (
              <p className="text-center text-xs text-white/40">
                Confirm the swap transaction in your wallet…
              </p>
            )}

            {/* Swap button */}
            <button
              onClick={handleSwap}
              disabled={!canSwap}
              aria-label={`Swap ${tokenIn} for ${tokenOut} via Circle Swap Kit`}
              className={`w-full rounded-2xl py-4 text-base font-semibold tracking-wide transition-all duration-200 ${
                canSwap
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25 hover:from-blue-400 hover:to-indigo-500 hover:shadow-blue-500/40 active:scale-[0.98]'
                  : 'cursor-not-allowed bg-white/[0.06] text-white/25'
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner />
                  {status === 'requesting'
                    ? 'Getting quote…'
                    : status === 'approving'
                      ? 'Approving…'
                      : 'Swapping…'}
                </span>
              ) : (
                `Swap ${tokenIn} → ${tokenOut}`
              )}
            </button>

            {/* Inline validation hint */}
            {validationError && !error && isConnected && isOnArcTestnet && (
              <p className="text-center text-xs text-white/30">{validationError}</p>
            )}
          </div>

          {/* Error display */}
          {error && status === 'error' && (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Success result */}
          {status === 'success' && txHash && (
            <div className="mt-4 flex flex-col gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
              <p className="text-xs font-semibold text-emerald-400">Swap successful!</p>

              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40">Tx Hash</span>
                <a
                  href={`${ARC_TESTNET_EXPLORER}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="max-w-[180px] truncate text-xs text-emerald-400 underline hover:text-emerald-300"
                >
                  {txHash}
                </a>
              </div>

              {estimatedOut && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/40">Est. Output</span>
                  <span className="text-xs font-medium text-white/70">
                    {estimatedOut} {tokenOut}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-white/20">
        Powered by{' '}
        <a
          href="https://developers.circle.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/30 underline-offset-2 hover:text-white/50 hover:underline"
        >
          Circle Swap Kit
        </a>{' '}
        · Arc Testnet only
      </p>
    </div>
  )
}
