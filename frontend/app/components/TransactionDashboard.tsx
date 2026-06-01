'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { encodeFunctionData, isAddress, zeroAddress } from 'viem'
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from 'wagmi'
import CircleSwapBox, { type SwapSummaryState } from '@/app/components/CircleSwapBox'
import { useAddressBook } from '@/app/hooks/useAddressBook'
import { useSwapHistory, type SwapHistoryEntry, type TransactionType } from '@/app/hooks/useSwapHistory'
import { hasWalletConnectProjectId } from '@/app/lib/walletEnv'
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_NAME,
  CIRCLE_SWAP_ADAPTER,
  ERC20_ABI,
  SUPPORTED_TOKENS,
  TOKENS,
  decodeExpectedTransfer,
  explorerTxUrl,
  formatTokenAmount,
  parseTokenAmount,
  tokenAddress,
  truncateHash,
  type SupportedToken,
} from '@/app/lib/tokens'

type Mode = 'bridge' | 'swap' | 'send' | 'batch' | 'portfolio' | 'approvals' | 'history'
type TxStatus = 'idle' | 'review' | 'pending' | 'success' | 'verification_failed' | 'rejected' | 'error'
type BridgeSourceNetwork = 'Ethereum' | 'Base' | 'Arbitrum' | 'Avalanche' | 'Polygon' | 'Optimism'

interface BridgeSummaryState {
  fromNetwork: BridgeSourceNetwork
  toNetwork: 'Arc Testnet'
  asset: 'USDC'
  amount: string
  destination: string
  status: string
}

type ApprovalRisk = 'Safe' | 'Review' | 'Unknown'

interface ApprovalSafetyState {
  knownSpender: string | null
  approvedTokensCount: number
  unknownSpendersCount: number
  recommendedAction: string
}

interface PortfolioSummaryState {
  walletAddress: string | null
  network: 'Arc Testnet'
  arcBalancesAvailable: boolean
  crossChainBalances: 'Coming soon'
  integration: 'Circle Unified Balance Kit ready'
  balances: Record<SupportedToken, bigint | null>
  loading: boolean
  refresh: () => void
}

const MODE_LABELS: Array<{ value: Mode; label: string }> = [
  { value: 'bridge', label: 'Bridge' },
  { value: 'swap', label: 'Swap' },
  { value: 'send', label: 'Send' },
  { value: 'batch', label: 'Batch' },
  { value: 'portfolio', label: 'Portfolio' },
  { value: 'approvals', label: 'Approvals' },
  { value: 'history', label: 'History' },
]

const BRIDGE_SOURCE_NETWORKS: BridgeSourceNetwork[] = ['Ethereum', 'Base', 'Arbitrum', 'Avalanche', 'Polygon', 'Optimism']

function nowMs(): number {
  return new Date().getTime()
}

function isUserRejection(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('user rejected') || lower.includes('user denied') || lower.includes('rejected the request') || lower.includes('action_rejected')
}

function PrimaryButton({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-2xl py-3.5 text-sm font-semibold transition-all ${disabled ? 'cursor-not-allowed bg-white/[0.07] text-white/45' : 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/20 hover:from-blue-400 hover:to-indigo-500'}`}
    >
      {children}
    </button>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium uppercase tracking-wider text-white/40">{children}</label>
}

function TokenSelect({ value, onChange, disabled }: { value: SupportedToken; onChange: (token: SupportedToken) => void; disabled?: boolean }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as SupportedToken)}
      disabled={disabled}
      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.06] px-3 py-2.5 text-sm font-semibold text-white outline-none hover:border-white/[0.14] focus:border-blue-500/50 disabled:opacity-50"
    >
      {SUPPORTED_TOKENS.map((token) => (
        <option key={token} value={token} className="bg-[#111318] text-white">{token}</option>
      ))}
    </select>
  )
}

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1200)
        }).catch(() => {})
      }}
      className="rounded-lg border border-white/[0.08] px-2 py-1 text-[11px] font-semibold text-white/35 hover:text-white/70"
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

function ReviewDialog({
  title,
  rows,
  warning,
  onCancel,
  onConfirm,
}: {
  title: string
  rows: Array<{ label: string; value: string }>
  warning?: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-3xl border border-white/[0.10] bg-[#111318] p-6 shadow-2xl shadow-black/80">
        <h2 className="mb-5 text-base font-semibold text-white">{title}</h2>
        <div className="mb-5 space-y-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
          {rows.map((row) => (
            <div key={`${row.label}-${row.value}`} className="flex items-start justify-between gap-4 text-sm">
              <span className="text-white/35">{row.label}</span>
              <span className="max-w-[220px] break-words text-right font-semibold text-white/75">{row.value}</span>
            </div>
          ))}
        </div>
        {warning && <p className="mb-5 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-4 py-3 text-xs leading-relaxed text-amber-300/80">{warning}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 rounded-2xl border border-white/[0.08] py-3 text-sm font-semibold text-white/50 hover:text-white/80">Cancel</button>
          <button type="button" onClick={onConfirm} className="flex-1 rounded-2xl bg-blue-500 py-3 text-sm font-semibold text-white hover:bg-blue-400">Confirm</button>
        </div>
      </div>
    </div>
  )
}

type PublicStepState = 'complete' | 'active' | 'muted' | 'warning' | 'failed'

function PublicStatusTimeline({
  steps,
}: {
  steps: Array<{ key: string; label: string; state: PublicStepState }>
}) {
  const isSettled = steps.every((step) => step.state !== 'active')
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center gap-2">
        {!isSettled && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-300" />}
        <p className="text-xs font-semibold uppercase tracking-wider text-white/35">Transaction status</p>
      </div>
      <div className="space-y-2">
        {steps.map((step) => (
          <div key={step.key} className="flex items-center gap-3">
            <span className={`h-2.5 w-2.5 rounded-full ${
              step.state === 'failed'
                ? 'bg-red-400'
                : step.state === 'warning'
                  ? 'bg-amber-400'
                  : step.state === 'complete'
                    ? 'bg-emerald-400'
                    : step.state === 'active'
                      ? 'bg-blue-400'
                      : 'bg-white/15'
            }`} />
            <span className={`text-xs ${
              step.state === 'failed'
                ? 'text-red-300'
                : step.state === 'warning'
                  ? 'text-amber-300'
                  : step.state === 'complete'
                    ? 'text-white/65'
                    : step.state === 'active'
                      ? 'text-blue-300'
                      : 'text-white/30'
            }`}>{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function UtilityCard({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="w-full overflow-hidden rounded-3xl border border-white/[0.09] bg-[#10131b]/88 shadow-[0_28px_100px_rgba(0,0,0,0.50),0_0_0_1px_rgba(147,197,253,0.035),inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-xl">
      <div className="p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {right ?? <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400">Arc Testnet</span>}
        </div>
        {children}
      </div>
    </div>
  )
}

function WalletGate() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      <p className="text-center text-sm text-white/55">Connect your wallet to start using Arenswap on Arc Testnet.</p>
      <ConnectButton label="Connect Wallet" />
      <p className="max-w-sm text-center text-xs leading-relaxed text-white/32">
        On mobile, open Arenswap inside your wallet browser or use MetaMask, Rainbow, Coinbase Wallet, or WalletConnect.
      </p>
      {!hasWalletConnectProjectId && (
        <p className="max-w-sm rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-3 py-2 text-center text-xs leading-relaxed text-amber-300/80">
          WalletConnect project ID is missing. Mobile wallet connection may not work.
        </p>
      )}
    </div>
  )
}

function ChainGate() {
  const { switchChain, isPending } = useSwitchChain()
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <p className="mb-2 text-xs text-amber-400">Please switch to Arc Testnet to continue.</p>
      <button type="button" onClick={() => switchChain({ chainId: ARC_TESTNET_CHAIN_ID })} disabled={isPending} className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/30 disabled:opacity-50">
        {isPending ? 'Switching...' : 'Switch to Arc Testnet'}
      </button>
    </div>
  )
}

function useTokenBalances() {
  const { address } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const [balances, setBalances] = useState<Record<SupportedToken, bigint | null>>({ USDC: null, EURC: null, cirBTC: null })
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!address || !publicClient || chainId !== ARC_TESTNET_CHAIN_ID) {
      setBalances({ USDC: null, EURC: null, cirBTC: null })
      return
    }
    setLoading(true)
    try {
      const results = await Promise.allSettled(
        SUPPORTED_TOKENS.map((token) => publicClient.readContract({
          address: tokenAddress(token),
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        })),
      )
      setBalances({
        USDC: results[0].status === 'fulfilled' ? results[0].value as bigint : null,
        EURC: results[1].status === 'fulfilled' ? results[1].value as bigint : null,
        cirBTC: results[2].status === 'fulfilled' ? results[2].value as bigint : null,
      })
    } finally {
      setLoading(false)
    }
  }, [address, chainId, publicClient])

  useEffect(() => {
    queueMicrotask(() => refresh().catch(() => {}))
  }, [refresh])

  return { balances, loading, refresh }
}

function BridgeMode({ onSummaryChange }: { onSummaryChange?: (summary: BridgeSummaryState) => void }) {
  const { address, isConnected } = useAccount()
  const [fromNetwork, setFromNetwork] = useState<BridgeSourceNetwork>('Base')
  const [amount, setAmount] = useState('')
  const [destination, setDestination] = useState('')
  const destinationEditedRef = useRef(false)
  const parsedAmount = Number(amount)
  const hasAmount = Number.isFinite(parsedAmount) && parsedAmount > 0
  const destinationIsValid = destination === '' || isAddress(destination)

  useEffect(() => {
    if (!address || destinationEditedRef.current || destination !== '') return
    queueMicrotask(() => setDestination(address))
  }, [address, destination])

  useEffect(() => {
    onSummaryChange?.({
      fromNetwork,
      toNetwork: 'Arc Testnet',
      asset: 'USDC',
      amount,
      destination,
      status: 'Ready for Bridge Kit integration',
    })
  }, [amount, destination, fromNetwork, onSummaryChange])

  const bridgeButtonText = !hasAmount
    ? 'Enter amount'
    : destination === '' || !destinationIsValid
      ? 'Enter destination'
      : 'Bridge Kit integration coming soon'

  return (
    <UtilityCard title="Bridge to Arc">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <FieldLabel>From network</FieldLabel>
            <select
              value={fromNetwork}
              onChange={(event) => setFromNetwork(event.target.value as BridgeSourceNetwork)}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.06] px-3 py-2.5 text-sm font-semibold text-white outline-none hover:border-white/[0.14] focus:border-blue-500/50"
            >
              {BRIDGE_SOURCE_NETWORKS.map((network) => (
                <option key={network} value={network} className="bg-[#111318] text-white">{network}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <FieldLabel>To network</FieldLabel>
            <div className="rounded-xl border border-blue-400/18 bg-blue-500/[0.08] px-3 py-2.5 text-sm font-semibold text-blue-100">
              Arc Testnet
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <FieldLabel>Asset</FieldLabel>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm font-semibold text-white">
            USDC
          </div>
        </div>

        <div className="space-y-1">
          <FieldLabel>Amount</FieldLabel>
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-xl font-semibold text-white outline-none focus:border-blue-500/50"
            placeholder="0.00"
          />
        </div>

        <div className="space-y-1">
          <FieldLabel>Destination wallet</FieldLabel>
          <input
            value={destination}
            onChange={(event) => {
              destinationEditedRef.current = true
              setDestination(event.target.value)
            }}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-blue-500/50"
            placeholder={isConnected ? '0x...' : 'Connect wallet to set destination'}
          />
          {!destinationIsValid && <p className="text-xs text-amber-300/80">Enter a valid EVM address.</p>}
        </div>

        {!isConnected ? (
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <PrimaryButton onClick={openConnectModal}>Connect Wallet</PrimaryButton>
            )}
          </ConnectButton.Custom>
        ) : (
          <PrimaryButton disabled onClick={() => {}}>{bridgeButtonText}</PrimaryButton>
        )}

        <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs leading-relaxed text-white/42">
          Bridge execution is not enabled yet. No bridge transaction will be submitted from this screen.
        </p>
      </div>
    </UtilityCard>
  )
}

function SendMode({ presetToken }: { presetToken?: SupportedToken }) {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { balances, loading, refresh } = useTokenBalances()
  const { addTransaction } = useSwapHistory()
  const { entries, addOrUpdate, remove } = useAddressBook()
  const [token, setToken] = useState<SupportedToken>(presetToken ?? 'USDC')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [label, setLabel] = useState('')
  const [status, setStatus] = useState<TxStatus>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const lockRef = useRef(false)

  useEffect(() => {
    if (presetToken) queueMicrotask(() => setToken(presetToken))
  }, [presetToken])

  const parsedAmount = parseTokenAmount(amount, token)
  const validation = useMemo(() => {
    if (!isConnected) return 'Wallet not connected.'
    if (chainId !== ARC_TESTNET_CHAIN_ID) return 'Please switch to Arc Testnet.'
    if (!walletClient || !publicClient) return 'Wallet connection is not ready. Reconnect your wallet and try again.'
    if (!isAddress(recipient)) return 'Enter a valid recipient address.'
    if (recipient.toLowerCase() === zeroAddress.toLowerCase()) return 'Recipient cannot be the zero address.'
    if (!parsedAmount) return 'Enter an amount greater than zero.'
    const balance = balances[token]
    if (balance !== null && parsedAmount > balance) return 'Insufficient balance.'
    return null
  }, [balances, chainId, isConnected, parsedAmount, publicClient, recipient, token, walletClient])

  const showSendStatus = status !== 'idle'
  const sendHasFailed = status === 'rejected' || status === 'error'
  const sendSteps = [
    { key: 'preparing', label: 'Preparing', state: status === 'review' ? 'active' : status === 'idle' ? 'muted' : 'complete' },
    { key: 'wallet', label: sendHasFailed && !txHash ? 'Wallet confirmation failed' : 'Wallet confirmation', state: sendHasFailed && !txHash ? 'failed' : status === 'pending' && !txHash ? 'active' : txHash || status === 'success' || status === 'verification_failed' ? 'complete' : 'muted' },
    { key: 'submitted', label: sendHasFailed && txHash ? 'Transaction failed' : 'Transaction submitted', state: sendHasFailed && txHash ? 'failed' : status === 'pending' && txHash ? 'active' : status === 'success' || status === 'verification_failed' ? 'complete' : 'muted' },
    { key: 'verified', label: status === 'verification_failed' ? 'Verification warning' : 'Verified', state: status === 'verification_failed' ? 'warning' : status === 'success' ? 'complete' : 'muted' },
  ] satisfies Array<{ key: string; label: string; state: PublicStepState }>

  async function executeSend() {
    if (validation || !address || !walletClient || !publicClient || !parsedAmount || lockRef.current) return
    lockRef.current = true
    setStatus('pending')
    setMessage(null)
    setTxHash(null)
    try {
      const meta = TOKENS[token]
      const hash = meta.isNative
        ? await walletClient.sendTransaction({ to: recipient as `0x${string}`, value: parsedAmount, account: address, chain: walletClient.chain })
        : await walletClient.sendTransaction({
            to: meta.address,
            data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'transfer', args: [recipient as `0x${string}`, parsedAmount] }),
            account: address,
            chain: walletClient.chain,
          })
      setTxHash(hash)
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      await refresh()
      const verified = receipt.status === 'success' && (meta.isNative || decodeExpectedTransfer(receipt.logs, token, address, recipient, parsedAmount))
      const nextStatus = verified ? 'success' : 'verification_failed'
      setStatus(nextStatus)
      setMessage(verified ? 'Send verified from transfer events.' : 'Transaction confirmed, but expected transfer was not detected.')
      addTransaction({
        type: 'send',
        timestamp: nowMs(),
        chainId: ARC_TESTNET_CHAIN_ID,
        status: verified ? 'success' : 'verification_failed',
        walletAddress: address,
        token,
        amount,
        recipient,
        txHash: hash,
        verificationSummary: verified ? 'Expected transfer detected.' : 'Receipt confirmed but transfer verification failed.',
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Send failed.'
      const rejected = isUserRejection(msg)
      setStatus(rejected ? 'rejected' : 'error')
      setMessage(rejected ? 'User rejected transaction.' : msg)
      addTransaction({
        type: 'send',
        timestamp: nowMs(),
        chainId: ARC_TESTNET_CHAIN_ID,
        status: rejected ? 'rejected' : 'failed',
        walletAddress: address,
        token,
        amount,
        recipient,
        txHash: null,
        errorMessage: rejected ? 'User rejected transaction.' : msg,
      })
    } finally {
      lockRef.current = false
    }
  }

  return (
    <UtilityCard title="Send Token">
      {!isConnected ? <WalletGate /> : chainId !== ARC_TESTNET_CHAIN_ID ? <ChainGate /> : (
        <div className="space-y-4">
          {status === 'review' && (
            <ReviewDialog
              title="Review Send"
              rows={[
                { label: 'Token', value: token },
                { label: 'Amount', value: `${amount} ${token}` },
                { label: 'Recipient', value: recipient },
                { label: 'Network', value: ARC_TESTNET_NAME },
              ]}
              onCancel={() => setStatus('idle')}
              onConfirm={executeSend}
            />
          )}
          <div className="space-y-1">
            <FieldLabel>Token</FieldLabel>
            <TokenSelect value={token} onChange={setToken} disabled={status === 'pending'} />
            <p className="text-xs text-white/30">Balance: {loading ? 'Checking balance...' : balances[token] !== null ? `${formatTokenAmount(balances[token]!, token)} ${token}` : 'Balance unavailable. Refresh or check your RPC connection.'}</p>
          </div>
          <div className="space-y-1">
            <FieldLabel>Recipient</FieldLabel>
            <input value={recipient} onChange={(event) => setRecipient(event.target.value)} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-blue-500/50" placeholder="0x..." />
            {entries.length > 0 && (
              <select value="" onChange={(event) => setRecipient(event.target.value)} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-xs text-white/70 outline-none">
                <option value="" className="bg-[#111318]">Select saved address</option>
                {entries.map((entry) => <option key={entry.id} value={entry.address} className="bg-[#111318]">{entry.label} - {truncateHash(entry.address)}</option>)}
              </select>
            )}
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="space-y-1">
              <FieldLabel>Amount</FieldLabel>
              <input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" inputMode="decimal" className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-xl font-semibold text-white outline-none focus:border-blue-500/50" placeholder="0.00" />
            </div>
            <button type="button" onClick={() => { const bal = balances[token]; if (bal !== null) setAmount(formatTokenAmount(bal, token).replace(/,/g, '')) }} className="mt-6 rounded-xl border border-white/[0.08] px-3 text-xs font-semibold text-white/45 hover:text-white/75">Max</button>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="mb-2 flex gap-2">
              <input value={label} onChange={(event) => setLabel(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-white outline-none" placeholder="Address label" />
              <button type="button" onClick={() => addOrUpdate(label, recipient)} className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs font-semibold text-white/45 hover:text-white/75">Save</button>
            </div>
            <div className="max-h-24 space-y-1 overflow-auto">
              {entries.length === 0 ? (
                <p className="text-xs text-white/30">No saved addresses yet. Enter a recipient and label, then save it here.</p>
              ) : (
                entries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-2 text-xs text-white/40">
                    <button type="button" onClick={() => setRecipient(entry.address)} className="min-w-0 truncate text-left hover:text-white/70">{entry.label}: {truncateHash(entry.address)}</button>
                    <button type="button" onClick={() => remove(entry.id)} className="text-white/25 hover:text-red-300">Delete</button>
                  </div>
                ))
              )}
            </div>
          </div>
          <PrimaryButton disabled={!!validation || status === 'pending'} onClick={() => setStatus('review')}>
            {status === 'pending' ? 'Waiting for wallet...' : 'Send'}
          </PrimaryButton>
          {showSendStatus && <PublicStatusTimeline steps={sendSteps} />}
          {validation && <p className="text-center text-xs text-white/30">{validation}</p>}
          {message && <p className={`rounded-xl border px-4 py-3 text-xs ${status === 'success' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/25 bg-amber-500/10 text-amber-300'}`}>{message}</p>}
          {txHash && <a href={explorerTxUrl(txHash)} target="_blank" rel="noopener noreferrer" className="block text-center text-xs text-blue-300/70 underline underline-offset-2">View {truncateHash(txHash)} on Arcscan</a>}
        </div>
      )}
    </UtilityCard>
  )
}

function BatchMode() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { balances, refresh } = useTokenBalances()
  const { addTransaction } = useSwapHistory()
  const [token, setToken] = useState<SupportedToken>('USDC')
  const [rows, setRows] = useState([{ recipient: '', amount: '' }])
  const [csv, setCsv] = useState('')
  const [review, setReview] = useState(false)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<Array<{ recipient: string; status: string; txHash?: string }>>([])
  const lockRef = useRef(false)
  const parsedRows = rows.map((row) => ({ ...row, parsed: parseTokenAmount(row.amount, token) }))
  const total = parsedRows.reduce((sum, row) => sum + (row.parsed ?? BigInt(0)), BigInt(0))
  const invalid = !isConnected || chainId !== ARC_TESTNET_CHAIN_ID || !walletClient || !publicClient || parsedRows.some((row) => !isAddress(row.recipient) || row.recipient.toLowerCase() === zeroAddress.toLowerCase() || !row.parsed) || total <= BigInt(0) || (balances[token] !== null && total > balances[token])
  const showBatchStatus = review || running || results.length > 0
  const batchRejected = results.some((result) => result.status === 'rejected')
  const batchFailed = results.some((result) => result.status === 'failed')
  const batchVerificationFailed = results.some((result) => result.status === 'verification failed')
  const batchAllConfirmed = results.length === parsedRows.length && results.every((result) => result.status === 'confirmed')
  const batchSteps = [
    { key: 'preparing', label: 'Preparing', state: review ? 'active' : running || results.length > 0 ? 'complete' : 'muted' },
    { key: 'wallet', label: batchRejected ? 'Wallet confirmation failed' : 'Wallet confirmation', state: batchRejected ? 'failed' : running && results.length === 0 ? 'active' : results.length > 0 ? 'complete' : 'muted' },
    { key: 'submitted', label: batchFailed ? 'Transaction failed' : 'Transaction submitted', state: batchFailed ? 'failed' : running && results.length > 0 ? 'active' : results.length > 0 ? 'complete' : 'muted' },
    { key: 'verified', label: batchVerificationFailed ? 'Verification warning' : 'Verified', state: batchVerificationFailed ? 'warning' : batchAllConfirmed ? 'complete' : 'muted' },
  ] satisfies Array<{ key: string; label: string; state: PublicStepState }>

  function importCsv() {
    const next = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 5).map((line) => {
      const [recipient = '', amount = ''] = line.split(',').map((part) => part.trim())
      return { recipient, amount }
    })
    if (next.length > 0) setRows(next)
  }

  async function runBatch() {
    if (invalid || !address || !walletClient || !publicClient || lockRef.current) return
    lockRef.current = true
    setRunning(true)
    setReview(false)
    setResults([])
    for (const row of parsedRows) {
      if (!row.parsed) continue
      try {
        const hash = await walletClient.sendTransaction({
          to: tokenAddress(token),
          data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'transfer', args: [row.recipient as `0x${string}`, row.parsed] }),
          account: address,
          chain: walletClient.chain,
        })
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        const verified = receipt.status === 'success' && decodeExpectedTransfer(receipt.logs, token, address, row.recipient, row.parsed)
        const status = verified ? 'confirmed' : 'verification failed'
        setResults((prev) => [...prev, { recipient: row.recipient, status, txHash: hash }])
        addTransaction({
          type: 'batch_send',
          timestamp: nowMs(),
          chainId: ARC_TESTNET_CHAIN_ID,
          status: verified ? 'success' : 'verification_failed',
          walletAddress: address,
          token,
          amount: row.amount,
          recipient: row.recipient,
          txHash: hash,
          verificationSummary: verified ? 'Expected batch transfer detected.' : 'Receipt confirmed but transfer verification failed.',
        })
        if (!verified) break
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Batch transaction failed.'
        const rejected = isUserRejection(msg)
        setResults((prev) => [...prev, { recipient: row.recipient, status: rejected ? 'rejected' : 'failed' }])
        addTransaction({
          type: 'batch_send',
          timestamp: nowMs(),
          chainId: ARC_TESTNET_CHAIN_ID,
          status: rejected ? 'rejected' : 'failed',
          walletAddress: address,
          token,
          amount: row.amount,
          recipient: row.recipient,
          txHash: null,
          errorMessage: rejected ? 'User rejected transaction.' : msg,
        })
        break
      }
    }
    await refresh()
    setRunning(false)
    lockRef.current = false
  }

  return (
    <UtilityCard title="Batch Send">
      {!isConnected ? <WalletGate /> : chainId !== ARC_TESTNET_CHAIN_ID ? <ChainGate /> : (
        <div className="space-y-4">
          {review && <ReviewDialog title="Review Batch Send" rows={[{ label: 'Token', value: token }, { label: 'Recipients', value: String(rows.length) }, { label: 'Total', value: `${formatTokenAmount(total, token)} ${token}` }]} warning="Batch send v1 sends one wallet transaction per recipient." onCancel={() => setReview(false)} onConfirm={runBatch} />}
          <p className="rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-4 py-3 text-xs text-amber-300/80">Batch send v1 sends one wallet transaction per recipient.</p>
          <TokenSelect value={token} onChange={setToken} disabled={running} />
          <div className="space-y-2">
            {rows.map((row, index) => (
              <div key={index} className="grid grid-cols-[1fr_96px_28px] gap-2">
                <input value={row.recipient} onChange={(event) => setRows((prev) => prev.map((item, i) => i === index ? { ...item, recipient: event.target.value } : item))} className="min-w-0 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-white outline-none" placeholder="0x recipient" />
                <input value={row.amount} onChange={(event) => setRows((prev) => prev.map((item, i) => i === index ? { ...item, amount: event.target.value } : item))} className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-white outline-none" placeholder="Amount" />
                <button type="button" onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))} disabled={rows.length === 1 || running} className="rounded-lg border border-white/[0.08] text-white/35 disabled:opacity-30">x</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => rows.length < 5 && setRows((prev) => [...prev, { recipient: '', amount: '' }])} disabled={rows.length >= 5 || running} className="w-full rounded-xl border border-white/[0.08] py-2 text-xs font-semibold text-white/45 hover:text-white/75 disabled:opacity-30">Add recipient</button>
          <textarea value={csv} onChange={(event) => setCsv(event.target.value)} className="h-20 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-white outline-none" placeholder="address,amount" />
          <button type="button" onClick={importCsv} disabled={running} className="text-xs font-semibold text-white/40 hover:text-white/70">Import CSV rows</button>
          <p className="text-xs text-white/35">Total: {formatTokenAmount(total, token)} {token}</p>
          <PrimaryButton disabled={invalid || running} onClick={() => setReview(true)}>{running ? 'Batch running...' : 'Review batch'}</PrimaryButton>
          {showBatchStatus && <PublicStatusTimeline steps={batchSteps} />}
          {results.length > 0 && <div className="space-y-2">{results.map((result, index) => <div key={`${result.recipient}-${index}`} className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs"><span className="truncate text-white/45">{truncateHash(result.recipient)}</span><span className="text-white/65">{result.status}</span></div>)}</div>}
        </div>
      )}
    </UtilityCard>
  )
}

function UnifiedBalancePanel({ summary }: { summary: PortfolioSummaryState | null }) {
  return (
    <div className="space-y-1">
      <MiniRow label="Wallet" value={summary?.walletAddress ? truncateHash(summary.walletAddress) : '—'} />
      <MiniRow label="Network" value="Arc Testnet" />
      <MiniRow label="Arc balances" value={summary?.arcBalancesAvailable ? 'Available' : '—'} />
      <MiniRow label="Cross-chain balances" value="Coming soon" />
      <MiniRow label="Integration" value="Circle Unified Balance Kit ready" />
      <button
        type="button"
        onClick={() => summary?.refresh()}
        disabled={!summary || summary.loading}
        className="mt-4 w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] py-2 text-xs font-semibold text-white/55 hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {summary?.loading ? 'Refreshing...' : 'Refresh balances'}
      </button>
    </div>
  )
}

function PortfolioMode({ setMode, setPresetToken, onSummaryChange }: { setMode: (mode: Mode) => void; setPresetToken: (token: SupportedToken) => void; onSummaryChange?: (summary: PortfolioSummaryState) => void }) {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { balances, loading, refresh } = useTokenBalances()
  const hasAnyBalance = SUPPORTED_TOKENS.some((token) => (balances[token] ?? BigInt(0)) > BigInt(0))
  const loadedBalanceCount = SUPPORTED_TOKENS.filter((token) => balances[token] !== null).length
  const totalOnArc = loadedBalanceCount > 0 ? `${loadedBalanceCount} token${loadedBalanceCount === 1 ? '' : 's'}` : '—'

  useEffect(() => {
    onSummaryChange?.({
      walletAddress: address ?? null,
      network: 'Arc Testnet',
      arcBalancesAvailable: loadedBalanceCount > 0,
      crossChainBalances: 'Coming soon',
      integration: 'Circle Unified Balance Kit ready',
      balances,
      loading,
      refresh,
    })
  }, [address, balances, loadedBalanceCount, loading, onSummaryChange, refresh])

  return (
    <UtilityCard title="Portfolio">
      {!isConnected ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-5 text-center">
          <p className="text-sm font-semibold text-white/60">Connect wallet to view balances.</p>
          <div className="mt-3">
            <ConnectButton label="Connect Wallet" />
          </div>
        </div>
      ) : chainId !== ARC_TESTNET_CHAIN_ID ? <ChainGate /> : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-blue-400/15 bg-blue-500/[0.055] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-200/55">Total on Arc</p>
                <p className="mt-1 text-2xl font-semibold text-white">{totalOnArc}</p>
              </div>
              <span className="rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-200">Arc Testnet</span>
            </div>
          </div>
          {loading && <p className="rounded-xl border border-blue-500/15 bg-blue-500/[0.06] px-4 py-3 text-xs text-blue-200/70">Checking Arc Testnet token balances...</p>}
          {!loading && !hasAnyBalance && (
            <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs text-white/40">No balances found. Claim testnet tokens to get started.</p>
          )}
          {SUPPORTED_TOKENS.map((token) => (
            <div key={token} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 shadow-inner shadow-white/[0.01]">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-white">{token}</span>
                  <p className="mt-0.5 text-xs text-white/35">Arc Testnet balance</p>
                </div>
                <span className="text-right text-sm font-semibold text-white/65">{loading ? 'Checking...' : balances[token] !== null ? formatTokenAmount(balances[token]!, token) : 'Unavailable'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => { setPresetToken(token); setMode('swap') }} className="rounded-xl border border-white/[0.08] py-2 text-xs font-semibold text-white/45 hover:text-white/75">Swap</button>
                <button type="button" onClick={() => { setPresetToken(token); setMode('send') }} className="rounded-xl border border-white/[0.08] py-2 text-xs font-semibold text-white/45 hover:text-white/75">Send</button>
                <button type="button" onClick={() => setPresetToken(token)} className="rounded-xl border border-white/[0.08] py-2 text-xs font-semibold text-white/45 hover:text-white/75">Max</button>
              </div>
            </div>
          ))}
          <PrimaryButton disabled={loading} onClick={refresh}>{loading ? 'Refreshing...' : 'Refresh balances'}</PrimaryButton>
          <div className="xl:hidden">
            <SidePanel title="Unified Balance">
              <UnifiedBalancePanel summary={{
                walletAddress: address ?? null,
                network: 'Arc Testnet',
                arcBalancesAvailable: loadedBalanceCount > 0,
                crossChainBalances: 'Coming soon',
                integration: 'Circle Unified Balance Kit ready',
                balances,
                loading,
                refresh,
              }} />
            </SidePanel>
          </div>
        </div>
      )}
    </UtilityCard>
  )
}

function isHighApprovalAmount(token: SupportedToken, allowance: bigint): boolean {
  const unlimitedThreshold = (BigInt(1) << BigInt(255))
  const highThreshold = parseTokenAmount('1000000', token)
  return allowance >= unlimitedThreshold || (highThreshold !== null && allowance >= highThreshold)
}

function getApprovalRisk(token: SupportedToken, allowance: bigint | null, spender: string | null): ApprovalRisk {
  if (!spender || allowance === null) return 'Unknown'
  if (spender.toLowerCase() !== CIRCLE_SWAP_ADAPTER.toLowerCase()) return 'Unknown'
  if (allowance > BigInt(0) && isHighApprovalAmount(token, allowance)) return 'Review'
  return 'Safe'
}

function RiskBadge({ risk }: { risk: ApprovalRisk }) {
  const classes = risk === 'Safe'
    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
    : risk === 'Review'
      ? 'border-amber-500/25 bg-amber-500/10 text-amber-300'
      : 'border-red-500/25 bg-red-500/10 text-red-300'
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${classes}`}>{risk}</span>
}

function ApprovalSafetyPanel({ safety }: { safety: ApprovalSafetyState | null }) {
  return (
    <div className="space-y-1">
      <MiniRow label="Known spender" value={safety?.knownSpender ? truncateHash(safety.knownSpender) : 'Unknown'} />
      <MiniRow label="Approved tokens" value={safety?.approvedTokensCount ?? 0} />
      <MiniRow label="Unknown spenders" value={safety?.unknownSpendersCount ?? 0} />
      <MiniRow label="Recommended action" value={safety?.recommendedAction ?? 'No action needed'} />
    </div>
  )
}

function ApprovalsMode({ onSafetyChange }: { onSafetyChange?: (safety: ApprovalSafetyState) => void }) {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { addTransaction } = useSwapHistory()
  const [allowances, setAllowances] = useState<Record<SupportedToken, bigint | null>>({ USDC: null, EURC: null, cirBTC: null })
  const [loading, setLoading] = useState(false)
  const [reviewToken, setReviewToken] = useState<SupportedToken | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const hasLoadedAllowances = SUPPORTED_TOKENS.some((token) => allowances[token] !== null)
  const hasActiveAllowance = SUPPORTED_TOKENS.some((token) => (allowances[token] ?? BigInt(0)) > BigInt(0))
  const safetySummary = useMemo<ApprovalSafetyState>(() => {
    const activeKnownApprovals = SUPPORTED_TOKENS.filter((token) => (allowances[token] ?? BigInt(0)) > BigInt(0))
    const unknownSpendersCount = SUPPORTED_TOKENS.filter((token) => getApprovalRisk(token, allowances[token], CIRCLE_SWAP_ADAPTER) === 'Unknown' && (allowances[token] ?? BigInt(0)) > BigInt(0)).length
    return {
      knownSpender: CIRCLE_SWAP_ADAPTER,
      approvedTokensCount: activeKnownApprovals.length,
      unknownSpendersCount,
      recommendedAction: unknownSpendersCount > 0
        ? 'Review unknown spenders'
        : activeKnownApprovals.length > 0
          ? 'Approvals look normal'
          : 'No action needed',
    }
  }, [allowances])

  useEffect(() => {
    onSafetyChange?.(safetySummary)
  }, [onSafetyChange, safetySummary])

  const refresh = useCallback(async () => {
    if (!address || !publicClient || chainId !== ARC_TESTNET_CHAIN_ID) return
    setLoading(true)
    try {
      const results = await Promise.allSettled(SUPPORTED_TOKENS.map((token) => publicClient.readContract({
        address: tokenAddress(token),
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, CIRCLE_SWAP_ADAPTER],
      })))
      setAllowances({
        USDC: results[0].status === 'fulfilled' ? results[0].value as bigint : null,
        EURC: results[1].status === 'fulfilled' ? results[1].value as bigint : null,
        cirBTC: results[2].status === 'fulfilled' ? results[2].value as bigint : null,
      })
    } finally {
      setLoading(false)
    }
  }, [address, chainId, publicClient])

  useEffect(() => {
    queueMicrotask(() => refresh().catch(() => {}))
  }, [refresh])

  async function revoke(token: SupportedToken) {
    if (!address || !walletClient || !publicClient) return
    setReviewToken(null)
    setLoading(true)
    try {
      const hash = await walletClient.sendTransaction({
        to: tokenAddress(token),
        data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [CIRCLE_SWAP_ADAPTER, BigInt(0)] }),
        account: address,
        chain: walletClient.chain,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      await refresh()
      const nextAllowance = await publicClient.readContract({ address: tokenAddress(token), abi: ERC20_ABI, functionName: 'allowance', args: [address, CIRCLE_SWAP_ADAPTER] }) as bigint
      const verified = nextAllowance === BigInt(0)
      setMessage(verified ? `Revoked ${token} allowance.` : `${token} revoke confirmed, but allowance is still non-zero.`)
      addTransaction({
        type: 'revoke',
        timestamp: nowMs(),
        chainId: ARC_TESTNET_CHAIN_ID,
        status: verified ? 'success' : 'verification_failed',
        walletAddress: address,
        token,
        spender: CIRCLE_SWAP_ADAPTER,
        txHash: hash,
        verificationSummary: verified ? 'Allowance reset to zero.' : 'Allowance remained non-zero after receipt.',
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Revoke failed.'
      const rejected = isUserRejection(msg)
      setMessage(rejected ? 'User rejected revoke.' : msg)
      addTransaction({
        type: 'revoke',
        timestamp: nowMs(),
        chainId: ARC_TESTNET_CHAIN_ID,
        status: rejected ? 'rejected' : 'failed',
        walletAddress: address,
        token,
        spender: CIRCLE_SWAP_ADAPTER,
        txHash: null,
        errorMessage: rejected ? 'User rejected revoke.' : msg,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <UtilityCard title="Approval Manager">
      {!isConnected ? <WalletGate /> : chainId !== ARC_TESTNET_CHAIN_ID ? <ChainGate /> : (
        <div className="space-y-4">
          {reviewToken && <ReviewDialog title="Review Revoke" rows={[{ label: 'Token', value: reviewToken }, { label: 'Spender', value: CIRCLE_SWAP_ADAPTER }, { label: 'Action', value: 'approve(spender, 0)' }]} onCancel={() => setReviewToken(null)} onConfirm={() => revoke(reviewToken)} />}
          <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs leading-relaxed text-white/35">Known swap spender: {truncateHash(CIRCLE_SWAP_ADAPTER)}. Unknown spenders are not shown or revoked.</p>
          {SUPPORTED_TOKENS.map((token) => {
            const allowance = allowances[token]
            const spender = CIRCLE_SWAP_ADAPTER
            const risk = getApprovalRisk(token, allowance, spender)
            return (
              <div key={token} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{token}</span>
                      <RiskBadge risk={risk} />
                    </div>
                    <p className="mt-1 text-xs text-white/35">Spender {spender ? truncateHash(spender) : 'Unknown'}</p>
                  </div>
                  <span className="text-right text-xs text-white/50">{loading ? 'Checking...' : allowance !== null ? `${formatTokenAmount(allowance, token)} ${token}` : 'Unavailable'}</span>
                </div>
                <button type="button" onClick={() => setReviewToken(token)} disabled={!allowance || allowance <= BigInt(0) || loading} className="w-full rounded-xl border border-white/[0.08] py-2 text-xs font-semibold text-white/45 hover:text-white/75 disabled:cursor-not-allowed disabled:opacity-30">Revoke</button>
              </div>
            )
          })}
          {hasLoadedAllowances && !hasActiveAllowance && !loading && (
            <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs text-white/35">No active approvals found.</p>
          )}
          <PrimaryButton disabled={loading} onClick={refresh}>{loading ? 'Refreshing...' : 'Refresh allowances'}</PrimaryButton>
          {message && <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs text-white/45">{message}</p>}
          <div className="xl:hidden">
            <SidePanel title="Approval Safety">
              <ApprovalSafetyPanel safety={safetySummary} />
            </SidePanel>
          </div>
        </div>
      )}
    </UtilityCard>
  )
}

function formatHistoryType(type: TransactionType | undefined): string {
  const value = type ?? 'swap'
  if (value === 'batch_send') return 'Batch'
  if (value === 'revoke') return 'Approval'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function getPrimaryTxHash(entry: SwapHistoryEntry | null): string | null {
  if (!entry) return null
  return entry.txHash ?? entry.swapTxHash ?? entry.approvalTxHash ?? entry.approveTxHash ?? null
}

function getHistorySlippage(entry: SwapHistoryEntry): string | null {
  const withSlippage = entry as SwapHistoryEntry & { slippage?: string | number | null; slippagePercent?: string | number | null }
  const value = withSlippage.slippagePercent ?? withSlippage.slippage ?? null
  if (value === null || value === undefined || value === '') return null
  return typeof value === 'number' ? `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%` : String(value)
}

function TransactionDetailPanel({ entry }: { entry: SwapHistoryEntry | null }) {
  if (!entry) {
    return <p className="text-xs leading-relaxed text-white/42">No local transaction records yet.</p>
  }

  const txHash = getPrimaryTxHash(entry)
  const type = entry.type ?? 'swap'
  const sentAmount = entry.amountIn ?? entry.amount ?? null
  const sentToken = entry.tokenIn ?? entry.token ?? null
  const receivedAmount = entry.amountOut ?? entry.estimatedOut ?? null
  const receivedToken = entry.tokenOut ?? null
  const tokenDisplay = type === 'swap'
    ? entry.tokenIn && entry.tokenOut ? `${entry.tokenIn} -> ${entry.tokenOut}` : '—'
    : entry.token ?? '—'
  const timestamp = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '—'

  return (
    <div className="space-y-1">
      <MiniRow label="Status" value={String(entry.status).replace(/[-_]/g, ' ')} />
      <MiniRow label="Type" value={formatHistoryType(type)} />
      <MiniRow label="Tx hash" value={txHash ? truncateHash(txHash) : '—'} />
      <MiniRow label="Token" value={tokenDisplay} />
      <MiniRow label="Amount sent" value={sentAmount ? `${sentAmount} ${sentToken ?? ''}`.trim() : '—'} />
      <MiniRow label="Amount received" value={receivedAmount ? `${receivedAmount} ${receivedToken ?? ''}`.trim() : '—'} />
      <MiniRow label="Slippage" value={getHistorySlippage(entry) ?? '—'} />
      <MiniRow label="Network" value="Arc Testnet" />
      <MiniRow label="Timestamp" value={timestamp} />
      {txHash && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <a href={`/tx/${txHash}`} className="rounded-xl border border-blue-400/20 bg-blue-500/[0.08] px-3 py-2 text-center text-xs font-semibold text-blue-200 hover:text-blue-100">
            Receipt
          </a>
          <a href={explorerTxUrl(txHash)} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-center text-xs font-semibold text-white/55 hover:text-white/80">
            Explorer
          </a>
          <div className="col-span-2 flex justify-center">
            <CopyButton value={txHash} label="Copy tx hash" />
          </div>
        </div>
      )}
    </div>
  )
}

function HistoryMode({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const { history, clearHistory, clearFailed } = useSwapHistory()
  const [filter, setFilter] = useState<'all' | TransactionType>('all')
  const filtered = filter === 'all' ? history : history.filter((entry) => (entry.type ?? 'swap') === filter)
  const selectedEntry = filtered.find((entry) => entry.id === selectedId) ?? filtered[0] ?? null

  return (
    <UtilityCard title="Recent Transactions">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(['all', 'swap', 'send', 'batch_send', 'approval', 'revoke'] as const).map((item) => (
            <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === item ? 'border-blue-500/40 bg-blue-500/15 text-blue-300' : 'border-white/[0.08] text-white/35 hover:text-white/65'}`}>{item === 'batch_send' ? 'Batch' : item === 'all' ? 'All' : item === 'revoke' ? 'Revoke' : item}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={clearFailed} className="rounded-xl border border-white/[0.08] px-3 py-2 text-xs font-semibold text-white/35 hover:text-white/70">Clear failed</button>
          <button type="button" onClick={clearHistory} className="rounded-xl border border-white/[0.08] px-3 py-2 text-xs font-semibold text-white/35 hover:text-white/70">Clear all</button>
        </div>
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-5">
            <p className="text-sm font-semibold text-white/55">
              {filter === 'all' ? 'No transactions yet.' : `No ${filter.replace('_', ' ')} transactions yet.`}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-white/35">
              {filter === 'all'
                ? 'Your swaps, sends, approvals, and batch transfers will appear here.'
                : `No ${filter.replace('_', ' ')} records are stored locally yet.`}
            </p>
          </div>
        ) : (
          <>
            <TransactionList entries={filtered} selectedId={selectedEntry?.id ?? null} onSelect={onSelect} />
            <div className="xl:hidden">
              <SidePanel title="Transaction Detail">
                <TransactionDetailPanel entry={selectedEntry} />
              </SidePanel>
            </div>
          </>
        )}
      </div>
    </UtilityCard>
  )
}

function TransactionList({ entries, selectedId, onSelect }: { entries: SwapHistoryEntry[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        const type = entry.type ?? 'swap'
        const txHash = getPrimaryTxHash(entry)
        const approvalHash = entry.approvalTxHash ?? entry.approveTxHash ?? null
        const status = String(entry.status).replace('-', '_')
        const selected = selectedId === entry.id
        const statusClass = status === 'success'
          ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
          : status === 'verification_failed'
            ? 'border-amber-500/25 bg-amber-500/10 text-amber-300'
            : 'border-red-500/25 bg-red-500/10 text-red-300'
        return (
          <div
            key={entry.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(entry.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onSelect(entry.id)
            }}
            className={`block w-full cursor-pointer rounded-2xl border px-4 py-3 text-left transition-colors ${selected ? 'border-blue-400/30 bg-blue-500/[0.08]' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'}`}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}>{status.replace('_', ' ')}</span>
              <span className="text-[10px] text-white/25">{new Date(entry.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <p className="text-xs font-semibold text-white/70">{type === 'swap' ? `${entry.tokenIn} -> ${entry.tokenOut}` : `${type.replace('_', ' ')} ${entry.amount ?? entry.amountIn ?? ''} ${entry.token ?? ''}`}</p>
            {type === 'swap' && (
              <div className="mt-1 space-y-0.5 text-xs text-white/35">
                {entry.amountIn && <p>Sent {entry.amountIn} {entry.tokenIn}</p>}
                {entry.estimatedOut && <p>Received {entry.estimatedOut} {entry.tokenOut}</p>}
              </div>
            )}
            {entry.recipient && <p className="mt-1 truncate text-xs text-white/35">To {entry.recipient}</p>}
            {entry.verificationSummary && <p className="mt-1 text-xs text-white/35">{entry.verificationSummary}</p>}
            {(txHash || approvalHash) && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {txHash && <a href={`/tx/${txHash}`} className="text-[11px] text-blue-300/70 underline underline-offset-2">Receipt</a>}
                {approvalHash && <a href={explorerTxUrl(approvalHash)} target="_blank" rel="noopener noreferrer" className="text-[11px] text-white/35 underline underline-offset-2 hover:text-white/60">Approval {truncateHash(approvalHash)}</a>}
                {txHash && <a href={explorerTxUrl(txHash)} target="_blank" rel="noopener noreferrer" className="text-[11px] text-emerald-500/70 underline underline-offset-2">Tx {truncateHash(txHash)}</a>}
                {txHash && <CopyButton value={txHash} label="Copy tx" />}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SidePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/[0.09] bg-[#10131b]/82 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-xl">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/52">{title}</p>
      {children}
    </div>
  )
}

function MiniRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] py-2 last:border-b-0">
      <span className="text-xs text-white/45">{label}</span>
      <span className="min-w-0 truncate text-right text-xs font-semibold text-white/65">{value}</span>
    </div>
  )
}

function DashboardSideRail({
  mode,
  approvalSafety,
  bridgeSummary,
  portfolioSummary,
  swapSummary,
  selectedHistoryId,
}: {
  mode: Mode
  approvalSafety: ApprovalSafetyState | null
  bridgeSummary: BridgeSummaryState | null
  portfolioSummary: PortfolioSummaryState | null
  swapSummary: SwapSummaryState | null
  selectedHistoryId: string | null
}) {
  const { isConnected } = useAccount()
  const { history } = useSwapHistory()
  const recent = history.slice(0, 3)
  const selectedHistoryEntry = history.find((entry) => entry.id === selectedHistoryId) ?? recent[0] ?? null
  const statusPill = (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${isConnected ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300' : 'border-white/[0.08] bg-white/[0.03] text-white/50'}`}>
      {isConnected ? 'Connected' : 'Not connected'}
    </span>
  )

  return (
    <aside className="hidden w-full xl:block">
      {mode === 'bridge' && (
        <SidePanel title="Bridge Summary">
          <div className="space-y-1">
            <MiniRow label="From network" value={bridgeSummary?.fromNetwork ?? 'Select network'} />
            <MiniRow label="To network" value="Arc Testnet" />
            <MiniRow label="Asset" value="USDC" />
            <MiniRow label="Amount" value={bridgeSummary?.amount ? `${bridgeSummary.amount} USDC` : 'Enter amount'} />
            <MiniRow label="Destination" value={bridgeSummary?.destination ? truncateHash(bridgeSummary.destination) : 'Set wallet'} />
            <MiniRow label="Status" value={bridgeSummary?.status ?? 'Ready for Bridge Kit integration'} />
          </div>
        </SidePanel>
      )}

      {mode === 'swap' && (
        <SidePanel title="Quote">
          {!swapSummary || !swapSummary.amountIn ? (
            <p className="text-sm text-white/50">Enter an amount to preview quote</p>
          ) : (
            <div className="space-y-1">
              <MiniRow label="Wallet" value={statusPill} />
              <MiniRow label="Rate" value={swapSummary.rate ? `1 ${swapSummary.tokenIn} = ${swapSummary.rate} ${swapSummary.tokenOut}` : swapSummary.status} />
              <MiniRow label="Min received" value={swapSummary.minReceived ? `${swapSummary.minReceived} ${swapSummary.tokenOut}` : swapSummary.status} />
              <MiniRow label="Slippage" value={`${swapSummary.slippagePercent.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`} />
              <MiniRow label="Fee" value={swapSummary.networkFee} />
              <MiniRow label="Route" value={swapSummary.route} />
              <MiniRow label="Status" value={swapSummary.status} />
            </div>
          )}
        </SidePanel>
      )}

      {mode === 'send' && (
        <SidePanel title="Transfer Review">
          <div className="space-y-1">
            <MiniRow label="Recipient" value="Set in form" />
            <MiniRow label="Token" value="Selected in form" />
            <MiniRow label="Amount" value="Entered in form" />
            <MiniRow label="Balance after" value="Calculated after review" />
            <MiniRow label="Network fee" value="Wallet estimate" />
            <MiniRow label="Status" value={isConnected ? 'Ready to review' : 'Connect wallet'} />
          </div>
        </SidePanel>
      )}

      {mode === 'batch' && (
        <SidePanel title="Batch Review">
          <div className="space-y-1">
            <MiniRow label="Recipients" value="Up to 5" />
            <MiniRow label="Total" value="Calculated in form" />
            <MiniRow label="Token" value="Selected in form" />
            <MiniRow label="Transactions" value="One per recipient" />
            <MiniRow label="Fee estimate" value="Wallet estimate per tx" />
            <MiniRow label="Validation" value={isConnected ? 'Check form rows' : 'Connect wallet'} />
          </div>
        </SidePanel>
      )}

      {mode === 'portfolio' && (
        <SidePanel title="Unified Balance">
          <UnifiedBalancePanel summary={portfolioSummary} />
        </SidePanel>
      )}

      {mode === 'approvals' && (
        <SidePanel title="Approval Safety">
          <ApprovalSafetyPanel safety={approvalSafety} />
        </SidePanel>
      )}

      {mode === 'history' && (
        <SidePanel title="Transaction Detail">
          <TransactionDetailPanel entry={selectedHistoryEntry} />
        </SidePanel>
      )}
    </aside>
  )
}

export default function TransactionDashboard() {
  const [mode, setMode] = useState<Mode>('swap')
  const [presetToken, setPresetToken] = useState<SupportedToken>('USDC')
  const [approvalSafety, setApprovalSafety] = useState<ApprovalSafetyState | null>(null)
  const [bridgeSummary, setBridgeSummary] = useState<BridgeSummaryState | null>(null)
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummaryState | null>(null)
  const [swapSummary, setSwapSummary] = useState<SwapSummaryState | null>(null)
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-4 xl:max-w-7xl xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start xl:gap-6">
      <div className="xl:col-span-2">
        <div className="grid w-full grid-cols-3 gap-1.5 rounded-2xl border border-white/[0.09] bg-[#10131b]/78 p-1.5 shadow-xl shadow-black/25 backdrop-blur-xl sm:grid-cols-7">
        {MODE_LABELS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setMode(item.value)}
            className={`rounded-xl px-2.5 py-2 text-xs font-semibold transition-colors ${mode === item.value ? 'bg-gradient-to-r from-blue-500/40 to-indigo-500/35 text-blue-50 shadow-sm shadow-blue-500/15' : 'text-white/55 hover:bg-white/[0.06] hover:text-white/82'}`}
          >
            {item.label}
          </button>
        ))}
        </div>
      </div>
      <div className="w-full">
        {mode === 'bridge' && <BridgeMode onSummaryChange={setBridgeSummary} />}
        {mode === 'swap' && <CircleSwapBox onSummaryChange={setSwapSummary} />}
        {mode === 'send' && <SendMode presetToken={presetToken} />}
        {mode === 'batch' && <BatchMode />}
        {mode === 'portfolio' && <PortfolioMode setMode={setMode} setPresetToken={setPresetToken} onSummaryChange={setPortfolioSummary} />}
        {mode === 'approvals' && <ApprovalsMode onSafetyChange={setApprovalSafety} />}
        {mode === 'history' && <HistoryMode selectedId={selectedHistoryId} onSelect={setSelectedHistoryId} />}
      </div>
      <DashboardSideRail mode={mode} approvalSafety={approvalSafety} bridgeSummary={bridgeSummary} portfolioSummary={portfolioSummary} swapSummary={swapSummary} selectedHistoryId={selectedHistoryId} />
    </div>
  )
}
