'use client'

import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'wagmi'
import { defineChain } from 'viem'
import { hasWalletConnectProjectId, walletConnectProjectId } from '@/app/lib/walletEnv'

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: 'https://testnet.arcscan.app',
    },
  },
  testnet: true,
})

type WagmiConfig = ReturnType<typeof getDefaultConfig>

const globalForWagmi = globalThis as typeof globalThis & {
  __arenswapWagmiConfig?: WagmiConfig
}

export const wagmiConfig = globalForWagmi.__arenswapWagmiConfig ?? getDefaultConfig({
  appName: 'Arenswap',
  projectId: hasWalletConnectProjectId ? walletConnectProjectId : 'missing-walletconnect-project-id',
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: http('https://rpc.testnet.arc.network'),
  },
  ssr: true,
})

globalForWagmi.__arenswapWagmiConfig = wagmiConfig
