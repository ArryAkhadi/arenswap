'use client'

export const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? ''
export const hasWalletConnectProjectId = walletConnectProjectId.trim().length > 0
