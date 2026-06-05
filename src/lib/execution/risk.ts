import { WalletBalance, ClaudeDecision, BotConfig } from '@/types';

export interface SizingResult {
  sizeContracts: number;
  notionalUsd: number;
  marginUsd: number;
  rejected: boolean;
  reason?: string;
}

/**
 * Converts Claude's sizeFraction into an executable contract size, capped by
 * the 70% wallet allocation, max leverage and max position limits.
 * Delta BTC perpetual contract value assumed at 0.001 BTC per contract.
 */
const CONTRACT_BTC_VALUE = 0.001;

export function computeSize(
  decision: ClaudeDecision,
  wallet: WalletBalance,
  markPrice: number,
  config: BotConfig
): SizingResult {
  if (markPrice <= 0) {
    return { sizeContracts: 0, notionalUsd: 0, marginUsd: 0, rejected: true, reason: 'Invalid mark price' };
  }

  const allocatable = wallet.availableBalance * config.walletAllocationPct;
  const requestedMargin = allocatable * Math.min(Math.max(decision.sizeFraction, 0), 1);

  if (requestedMargin <= 0) {
    return { sizeContracts: 0, notionalUsd: 0, marginUsd: 0, rejected: true, reason: 'Zero margin requested' };
  }

  let notional = requestedMargin * config.maxLeverage;
  notional = Math.min(notional, config.maxPositionUsd);

  const sizeContracts = Math.floor(notional / (markPrice * CONTRACT_BTC_VALUE));
  if (sizeContracts < 1) {
    return { sizeContracts: 0, notionalUsd: 0, marginUsd: 0, rejected: true, reason: 'Computed size below 1 contract' };
  }

  const actualNotional = sizeContracts * markPrice * CONTRACT_BTC_VALUE;
  const actualMargin = actualNotional / config.maxLeverage;

  return {
    sizeContracts,
    notionalUsd: Number(actualNotional.toFixed(2)),
    marginUsd: Number(actualMargin.toFixed(2)),
    rejected: false,
  };
}

/** Validates that SL/TP are on the correct side of entry for the direction. */
export function validateLevels(decision: ClaudeDecision, entry: number): { valid: boolean; reason?: string } {
  const { direction, stopLoss, takeProfit1 } = decision;
  if (stopLoss === null || takeProfit1 === null) {
    return { valid: false, reason: 'Missing SL or TP1' };
  }
  if (direction === 'SHORT') {
    if (stopLoss <= entry) return { valid: false, reason: 'SHORT stop-loss must be above entry' };
    if (takeProfit1 >= entry) return { valid: false, reason: 'SHORT TP1 must be below entry' };
  } else if (direction === 'LONG') {
    if (stopLoss >= entry) return { valid: false, reason: 'LONG stop-loss must be below entry' };
    if (takeProfit1 <= entry) return { valid: false, reason: 'LONG TP1 must be above entry' };
  } else {
    return { valid: false, reason: 'Cannot open a NEUTRAL position' };
  }
  return { valid: true };
}

/** Confirms the TP1 distance clears round-trip fees + the net profit floor. */
export function clearsProfitFloor(decision: ClaudeDecision, entry: number, config: BotConfig): boolean {
  if (decision.takeProfit1 === null) return false;
  const grossMovePct = Math.abs(decision.takeProfit1 - entry) / entry;
  const roundTripFees = config.takerFeePct * 2;
  const netPct = grossMovePct - roundTripFees;
  return netPct >= config.minNetProfitPct;
}
