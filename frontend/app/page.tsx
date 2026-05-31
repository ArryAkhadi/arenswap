'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import Image from 'next/image'
import Link from 'next/link'
import TransactionDashboard from '@/app/components/TransactionDashboard'

function HeaderConnectButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        const ready = mounted
        const connected = ready && account && chain

        if (!ready) {
          return (
            <button
              type="button"
              disabled
              className="rounded-full border border-white/[0.08] bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white/45"
            >
              Connect Wallet
            </button>
          )
        }

        if (!connected) {
          return (
            <button
              type="button"
              onClick={openConnectModal}
              className="rounded-full border border-blue-300/20 bg-blue-500/[0.12] px-3 py-1.5 text-xs font-semibold text-blue-50 transition-colors hover:border-blue-300/35 hover:bg-blue-500/[0.18]"
            >
              Connect Wallet
            </button>
          )
        }

        if (chain.unsupported) {
          return (
            <button
              type="button"
              onClick={openChainModal}
              className="rounded-full border border-amber-400/25 bg-amber-500/[0.12] px-3 py-1.5 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/[0.18]"
            >
              Wrong network
            </button>
          )
        }

        return (
          <button
            type="button"
            onClick={openAccountModal}
            className="rounded-full border border-white/[0.08] bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:border-white/[0.14] hover:bg-white/[0.09] hover:text-white"
          >
            {account.displayName}
          </button>
        )
      }}
    </ConnectButton.Custom>
  )
}

function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.09] bg-[#080a10]/80 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-3 py-3 sm:h-16 sm:px-6 sm:py-0">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Arenswap home">
          <Image
            src="/favicon.ico"
            alt="Arenswap logo"
            width={32}
            height={32}
            unoptimized
            className="h-8 w-8 shrink-0 rounded-lg object-cover"
          />
          <span className="hidden text-lg font-semibold tracking-tight text-white sm:inline">Arenswap</span>
        </Link>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-none sm:gap-3">
          <div className="hidden items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/[0.11] px-3 py-1 sm:flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            <span className="text-xs font-semibold text-emerald-300">Arc Testnet</span>
          </div>
          <a
            href="https://faucet.circle.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-full border border-blue-300/20 bg-blue-400/[0.09] px-2.5 py-1 text-[11px] font-semibold text-blue-50/80 transition-colors hover:border-blue-300/35 hover:bg-blue-400/[0.14] hover:text-blue-50 sm:px-3 sm:text-xs"
          >
            Faucet
          </a>
          <div className="min-w-0 shrink">
            <HeaderConnectButton />
          </div>
        </div>
      </div>
    </header>
  )
}

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#080a10]">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 70% 38% at 50% -8%, rgba(59,130,246,0.18) 0%, rgba(59,130,246,0.06) 42%, transparent 76%), radial-gradient(ellipse 42% 32% at 78% 12%, rgba(99,102,241,0.14) 0%, transparent 72%), radial-gradient(ellipse 56% 34% at 50% 92%, rgba(79,70,229,0.10) 0%, transparent 72%), linear-gradient(180deg, #090b12 0%, #080a10 52%, #07080d 100%)',
        }}
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.018]"
        aria-hidden="true"
        style={{
          backgroundImage: 'linear-gradient(rgba(190,210,255,0.55) 1px, transparent 1px), linear-gradient(90deg, rgba(190,210,255,0.55) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'linear-gradient(to bottom, black, transparent 58%)',
        }}
      />

      <Navbar />

      <main className="relative z-10 flex flex-1 flex-col items-center px-4 pb-12 pt-6 sm:pt-8">
        <div className="mb-5 text-center">
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Swap stablecoins on <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">Arc Testnet</span>
          </h1>
          <p className="mx-auto max-w-xl text-sm text-white/60 sm:text-base">
            Swap, send, and manage USDC, EURC, and cirBTC testnet tokens in one simple dApp.
          </p>
          <div className="mt-3 flex justify-center">
            <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1 text-[11px] font-semibold text-white/55">
              Testnet only &middot; No real funds &middot; Built for Arc
            </span>
          </div>
        </div>

        <div className="mb-2.5 w-full max-w-[34rem] rounded-3xl border border-blue-400/[0.12] bg-blue-500/[0.045] p-4 shadow-xl shadow-black/20 backdrop-blur-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">Need testnet tokens?</p>
              <p className="mt-1 text-xs leading-relaxed text-white/58">
                Get USDC, EURC, and cirBTC from the Circle Faucet before testing Arenswap.
              </p>
            </div>
            <a
              href="https://faucet.circle.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-3.5 py-2 text-center text-xs font-semibold text-white shadow-lg shadow-blue-500/15 transition-colors hover:from-blue-400 hover:to-indigo-500"
            >
              Get Testnet Tokens
            </a>
          </div>
        </div>

        <TransactionDashboard />
      </main>

      <footer className="relative z-10 border-t border-white/[0.05] py-6">
        <p className="text-center text-xs text-white/45">
          Built on{' '}
          <a href="https://docs.arc.io" target="_blank" rel="noopener noreferrer" className="text-white/60 underline-offset-2 hover:text-white/80 hover:underline">
            Arc Network
          </a>{' '}
          &middot; Powered by{' '}
          <a href="https://developers.circle.com" target="_blank" rel="noopener noreferrer" className="text-white/60 underline-offset-2 hover:text-white/80 hover:underline">
            Circle Swap Kit
          </a>{' '}
          &middot; Arc Testnet only
        </p>
      </footer>
    </div>
  )
}
