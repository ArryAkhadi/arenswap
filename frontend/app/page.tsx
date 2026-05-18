'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import TransactionDashboard from '@/app/components/TransactionDashboard'

function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-[#0a0b0f]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M7 16l5-8 5 8M9.5 12h5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-lg font-semibold tracking-tight text-white">
            Aren<span className="text-blue-400">swap</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 sm:flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            <span className="text-xs font-medium text-emerald-400">Arc Testnet</span>
          </div>
          <a
            href="https://faucet.circle.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/50 transition-colors hover:border-white/[0.14] hover:bg-white/[0.07] hover:text-white/80"
          >
            Faucet
          </a>
          <ConnectButton chainStatus="icon" showBalance={false} accountStatus="avatar" />
        </div>
      </div>
    </header>
  )
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0a0b0f]">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        aria-hidden="true"
        style={{ background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(59,130,246,0.12) 0%, transparent 70%)' }}
      />

      <Navbar />

      <main className="relative z-10 flex flex-1 flex-col items-center px-4 pb-12 pt-8 sm:pt-10">
        <div className="mb-6 text-center">
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Arc Testnet{' '}
            <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
              transactions
            </span>
          </h1>
          <p className="mx-auto max-w-xl text-sm text-white/40 sm:text-base">
            Swap, send, manage approvals, and inspect local receipts for USDC, EURC, and cirBTC.
          </p>
        </div>

        <TransactionDashboard />
      </main>

      <footer className="relative z-10 border-t border-white/[0.04] py-6">
        <p className="text-center text-xs text-white/20">
          Built on{' '}
          <a href="https://docs.arc.io" target="_blank" rel="noopener noreferrer" className="text-white/30 underline-offset-2 hover:text-white/50 hover:underline">
            Arc Network
          </a>{' '}
          · Powered by Circle USDC &amp; EURC
        </p>
      </footer>
    </div>
  )
}
