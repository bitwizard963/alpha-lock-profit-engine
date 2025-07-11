import { TradingSignal } from './AIOrchestrator';
import SupabaseTradingService from './SupabaseTradingService';

interface TradingConfig {
  maxPositions: number;
  riskPerTrade: number;
  stopLossPercent: number;
  takeProfitMultiplier: number;
  atrPeriod: number;
  trailingStopPercent: number;
}

interface Position {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  trailingStopPrice: number;
  takeProfitPrice: number;
  profitLockMethod: string;
  timeHeld: string;
  entryTime: number;
  edgeDecayScore: number;
  maxDrawdownFromPeak: number;
  peakPnL: number;
  atrValue: number;
  originalSignal: TradingSignal;
}

interface ProfitLockConfig {
  method: string;
  atrMultiplier: number;
  trailingPercent: number;
  partialProfitLevels: number[];
  timeBasedExitMinutes: number;
  edgeDecayThreshold: number;
  maxDrawdownPercent: number;
}

class ProfitLockingEngine {
  private positions: Map<string, Position> = new Map();
  private exitCallbacks: Set<(position: Position, reason: string) => void> = new Set();
  private priceHistory: Record<string, number[]> = {};
  private signalIdMap: Map<string, string> = new Map(); // Maps position IDs to signal IDs
  private config: TradingConfig;

  constructor(config?: Partial<TradingConfig>) {
    this.config = {
      maxPositions: 250, // Increased from default 5-6
      riskPerTrade: 0.02, // 2% risk per trade (configurable)
      stopLossPercent: 0.03, // 3% stop loss (configurable)
      takeProfitMultiplier: 2.5, // 2.5:1 risk/reward ratio
      atrPeriod: 14, // ATR calculation period
      trailingStopPercent: 0.02, // 2% trailing stop
      ...config
    };
    
    console.log(`🎯 ProfitLockingEngine initialized with max ${this.config.maxPositions} positions`);
  }

  private get defaultConfigs(): Record<string, ProfitLockConfig> {
    return {
    volatility_adaptive_trailing_stop: {
      method: 'volatility_adaptive_trailing_stop',
      atrMultiplier: this.config.takeProfitMultiplier,
      trailingPercent: this.config.trailingStopPercent,
      partialProfitLevels: [],
      timeBasedExitMinutes: 0,
      edgeDecayThreshold: 0.1,
      maxDrawdownPercent: 0.15
    },
    partial_profit_scaling: {
      method: 'partial_profit_scaling',
      atrMultiplier: this.config.takeProfitMultiplier * 0.8,
      trailingPercent: this.config.trailingStopPercent * 0.8,
      partialProfitLevels: [0.5, 0.75],
      timeBasedExitMinutes: 0,
      edgeDecayThreshold: 0.1,
      maxDrawdownPercent: 0.12
    },
    fixed_take_profit: {
      method: 'fixed_take_profit',
      atrMultiplier: this.config.takeProfitMultiplier * 0.6,
      trailingPercent: this.config.trailingStopPercent * 1.2,
      partialProfitLevels: [],
      timeBasedExitMinutes: 0,
      edgeDecayThreshold: 0.1,
      maxDrawdownPercent: 0.20
    },
    time_based_stop: {
      method: 'time_based_stop',
      atrMultiplier: this.config.takeProfitMultiplier,
      trailingPercent: this.config.trailingStopPercent,
      partialProfitLevels: [],
      timeBasedExitMinutes: 240, // 4 hours max hold time
      edgeDecayThreshold: 0.1,
      maxDrawdownPercent: 0.15
    },
    edge_decay_exit: {
      method: 'edge_decay_exit',
      atrMultiplier: this.config.takeProfitMultiplier * 1.2,
      trailingPercent: this.config.trailingStopPercent * 1.5,
      partialProfitLevels: [],
      timeBasedExitMinutes: 0,
      edgeDecayThreshold: 0.05,
      maxDrawdownPercent: 0.18
    },
    drawdown_trailing_stop: {
      method: 'drawdown_trailing_stop',
      atrMultiplier: this.config.takeProfitMultiplier * 1.4,
      trailingPercent: this.config.trailingStopPercent * 0.8,
      partialProfitLevels: [],
      timeBasedExitMinutes: 0,
      edgeDecayThreshold: 0.1,
      maxDrawdownPercent: 0.10
    }
    };
  }

  addPosition(signal: TradingSignal, size: number, signalId?: string): string {
    // Check position limits
    if (this.positions.size >= this.config.maxPositions) {
      console.log(`⚠️ Maximum positions reached (${this.config.maxPositions}), rejecting new position`);
      return '';
    }

    // Check if we already have too many positions for this symbol (max 3 per symbol)
    const existingPositions = Array.from(this.positions.values()).filter(p => p.symbol === signal.symbol);
    if (existingPositions.length >= 3) {
      console.log(`⚠️ Maximum positions for ${signal.symbol} reached (3), rejecting new position`);
      return '';
    }

    const positionId = `${signal.symbol}_${Date.now()}`;
    const method = this.selectProfitLockMethod(signal);
    const config = this.defaultConfigs[method];
    const atrValue = this.calculateATR(signal.symbol);

    const position: Position = {
      id: positionId,
      symbol: signal.symbol,
      side: signal.action === 'buy' ? 'long' : 'short',
      size,
      entryPrice: signal.price,
      currentPrice: signal.price,
      unrealizedPnL: 0,
      unrealizedPnLPct: 0,
      trailingStopPrice: this.calculateInitialStopPrice(signal, config, atrValue),
      takeProfitPrice: this.calculateTakeProfitPrice(signal, config, atrValue),
      profitLockMethod: method,
      timeHeld: '0m',
      entryTime: Date.now(),
      edgeDecayScore: 1.0,
      maxDrawdownFromPeak: 0,
      peakPnL: 0,
      atrValue,
      originalSignal: signal
    };

    this.positions.set(positionId, position);
    console.log(`✅ Added position ${positionId} using ${method} (${this.positions.size}/${this.config.maxPositions})`);
    
    // Save to database if signalId provided
    if (signalId) {
      this.signalIdMap.set(positionId, signalId);
      SupabaseTradingService.savePosition(position, signalId);
    }
    
    return positionId;
  }

  updatePositions(currentPrices: Record<string, number>) {
    this.positions.forEach((position, id) => {
      if (currentPrices[position.symbol]) {
        this.updatePosition(position, currentPrices[position.symbol]);
        this.checkExitConditions(position);
      }
    });
  }

  private updatePosition(position: Position, currentPrice: number) {
    position.currentPrice = currentPrice;
    
    // Initialize price history for new symbols
    if (!this.priceHistory[position.symbol]) {
      this.priceHistory[position.symbol] = [];
    }
    
    this.priceHistory[position.symbol].push(currentPrice);
    if (this.priceHistory[position.symbol].length > this.config.atrPeriod * 5) {
      this.priceHistory[position.symbol].shift();
    }

    // Calculate PnL
    const priceDiff = currentPrice - position.entryPrice;
    position.unrealizedPnL = position.side === 'long' ? 
      priceDiff * position.size : 
      -priceDiff * position.size;
    position.unrealizedPnLPct = (position.unrealizedPnL / (position.entryPrice * position.size)) * 100;

    // Update peak PnL and drawdown
    if (position.unrealizedPnL > position.peakPnL) {
      position.peakPnL = position.unrealizedPnL;
    }
    
    const drawdownFromPeak = position.peakPnL > 0 ? 
      (position.peakPnL - position.unrealizedPnL) / position.peakPnL : 0;
    
    // Clamp drawdown to prevent numeric overflow (max 5.0 = 500% drawdown)
    const clampedDrawdown = Math.min(Math.max(0, drawdownFromPeak), 5.0);
    position.maxDrawdownFromPeak = Math.max(position.maxDrawdownFromPeak, clampedDrawdown);

    // Update time held
    const timeElapsed = Date.now() - position.entryTime;
    const minutes = Math.floor(timeElapsed / 60000);
    const hours = Math.floor(minutes / 60);
    position.timeHeld = hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;

    // Update edge decay score
    position.edgeDecayScore = this.calculateEdgeDecay(position);

    // Update trailing stop
    this.updateTrailingStop(position);
    
    // Save position updates to database
    SupabaseTradingService.updatePosition(position).catch(console.error);
  }

  private checkExitConditions(position: Position) {
    const config = this.defaultConfigs[position.profitLockMethod];
    const reasons: string[] = [];

    console.log(`🔍 Checking exit conditions for ${position.id}:`);
    console.log(`   Current price: ${position.currentPrice}, Entry: ${position.entryPrice}`);
    console.log(`   PnL: ${position.unrealizedPnL.toFixed(2)} (${position.unrealizedPnLPct.toFixed(2)}%)`);
    console.log(`   Trailing stop: ${position.trailingStopPrice}`);
    console.log(`   Edge score: ${position.edgeDecayScore.toFixed(3)}`);

    // Don't check exit conditions for very new positions (less than 10 seconds)
    const positionAge = Date.now() - position.entryTime;
    if (positionAge < 10000) {
      console.log(`   ⏰ Position too new (${positionAge}ms), skipping exit checks`);
      return;
    }

    // Check trailing stop
    if (this.isTrailingStopTriggered(position)) {
      reasons.push('Trailing stop triggered');
      console.log(`   ❌ Trailing stop triggered`);
    }

    // Check take profit
    if (this.isTakeProfitTriggered(position)) {
      reasons.push('Take profit reached');
      console.log(`   ✅ Take profit reached`);
    }

    // Check time-based exit
    if (this.isTimeBasedExitTriggered(position, config)) {
      reasons.push('Time-based exit');
      console.log(`   ⏰ Time-based exit triggered`);
    }

    // Check edge decay - make less aggressive
    if (position.edgeDecayScore < config.edgeDecayThreshold && positionAge > 60000) { // Only after 1 minute
      reasons.push('Edge decay threshold reached');
      console.log(`   📉 Edge decay triggered`);
    }

    // Check max drawdown - make less aggressive
    if (position.maxDrawdownFromPeak > config.maxDrawdownPercent && position.unrealizedPnL < 0) { // Only for losing positions
      reasons.push('Maximum drawdown exceeded');
      console.log(`   📉 Max drawdown exceeded`);
    }

    // Execute exit if any condition is met
    if (reasons.length > 0) {
      console.log(`🚪 Exiting position ${position.id}: ${reasons.join(', ')}`);
      this.exitPosition(position, reasons.join(', '));
    } else {
      console.log(`   ✅ All exit checks passed, position remains open`);
    }
  }

  private selectProfitLockMethod(signal: TradingSignal): string {
    // Method selection based on strategy and market conditions
    const methodMappings: Record<string, string> = {
      'scalping': 'partial_profit_scaling',
      'momentum': 'volatility_adaptive_trailing_stop',
      'trend_following': 'volatility_adaptive_trailing_stop',
      'mean_reversion': 'fixed_take_profit',
      'breakout': 'volatility_adaptive_trailing_stop',
      'swing_trading': 'drawdown_trailing_stop',
      'statistical_arbitrage': 'edge_decay_exit',
      'contextual_bandits': 'drawdown_trailing_stop'
    };

    return methodMappings[signal.strategy] || 'volatility_adaptive_trailing_stop';
  }

  private calculateATR(symbol: string): number {
    const prices = this.priceHistory[symbol] || [];
    if (prices.length < this.config.atrPeriod) {
      return prices.length > 0 ? prices[prices.length - 1] * this.config.stopLossPercent : 0.01;
    }

    // For crypto, we'll use price ranges as a proxy for ATR
    let atrSum = 0;
    for (let i = 1; i < Math.min(this.config.atrPeriod, prices.length); i++) {
      const priceRange = Math.abs(prices[i] - prices[i - 1]);
      atrSum += priceRange;
    }
    
    return atrSum / Math.min(this.config.atrPeriod - 1, prices.length - 1);
  }

  private calculateInitialStopPrice(signal: TradingSignal, config: ProfitLockConfig, atr: number): number {
    // Use configurable percentage-based initial stop
    const stopDistance = signal.price * this.config.stopLossPercent;
    
    if (signal.action === 'buy') {
      return signal.price - stopDistance;
    } else {
      return signal.price + stopDistance;
    }
  }

  private calculateTakeProfitPrice(signal: TradingSignal, config: ProfitLockConfig, atr: number): number {
    const atrDistance = atr * config.atrMultiplier * 2; // 2:1 risk/reward
    
    if (signal.action === 'buy') {
      return signal.price + atrDistance;
    } else {
      return signal.price - atrDistance;
    }
  }

  private updateTrailingStop(position: Position) {
    const config = this.defaultConfigs[position.profitLockMethod];
    
    if (position.side === 'long') {
      const newStop = position.currentPrice * (1 - config.trailingPercent);
      if (newStop > position.trailingStopPrice) {
        position.trailingStopPrice = newStop;
      }
    } else {
      const newStop = position.currentPrice * (1 + config.trailingPercent);
      if (newStop < position.trailingStopPrice) {
        position.trailingStopPrice = newStop;
      }
    }
  }

  private isTrailingStopTriggered(position: Position): boolean {
    if (position.side === 'long') {
      return position.currentPrice <= position.trailingStopPrice;
    } else {
      return position.currentPrice >= position.trailingStopPrice;
    }
  }

  private isTakeProfitTriggered(position: Position): boolean {
    if (position.side === 'long') {
      return position.currentPrice >= position.takeProfitPrice;
    } else {
      return position.currentPrice <= position.takeProfitPrice;
    }
  }

  private isTimeBasedExitTriggered(position: Position, config: ProfitLockConfig): boolean {
    if (config.timeBasedExitMinutes === 0) return false;
    
    const timeElapsed = Date.now() - position.entryTime;
    const minutes = timeElapsed / 60000;
    
    return minutes >= config.timeBasedExitMinutes;
  }

  private calculateEdgeDecay(position: Position): number {
    const timeElapsed = Date.now() - position.entryTime;
    const hours = timeElapsed / (1000 * 60 * 60);
    
    // Edge decays exponentially over time
    const decayRate = 0.1; // Configurable decay rate
    return Math.exp(-decayRate * hours);
  }

  private exitPosition(position: Position, reason: string) {
    console.log(`Exiting position ${position.id}: ${reason}`);
    console.log(`Final PnL: $${position.unrealizedPnL.toFixed(2)} (${position.unrealizedPnLPct.toFixed(2)}%)`);
    
    // Close position in database
    SupabaseTradingService.closePosition(position, reason).catch(console.error);
    
    this.exitCallbacks.forEach(callback => {
      try {
        callback(position, reason);
      } catch (error) {
        console.error('Error in exit callback:', error);
      }
    });
    
    this.positions.delete(position.id);
    this.signalIdMap.delete(position.id);
  }

  onPositionExit(callback: (position: Position, reason: string) => void) {
    this.exitCallbacks.add(callback);
  }

  getPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  getPosition(id: string): Position | undefined {
    return this.positions.get(id);
  }

  removePosition(id: string) {
    this.positions.delete(id);
    this.signalIdMap.delete(id);
  }

  updateConfig(newConfig: Partial<TradingConfig>) {
    this.config = { ...this.config, ...newConfig };
    console.log(`🔧 Updated trading config:`, this.config);
  }

  getConfig(): TradingConfig {
    return { ...this.config };
  }

  getPositionLimits(): { current: number; max: number; available: number } {
    return {
      current: this.positions.size,
      max: this.config.maxPositions,
      available: this.config.maxPositions - this.positions.size
    };
  }

  // Hybrid profit locking methods
  applyProfitEnvelopeGuard(position: Position): boolean {
    // Combines volatility adaptive trailing stop, edge decay exit, and drawdown trailing stop
    const volatilityCondition = this.isTrailingStopTriggered(position);
    const edgeCondition = position.edgeDecayScore < 0.3;
    const drawdownCondition = position.maxDrawdownFromPeak > 0.05;
    
    return volatilityCondition || edgeCondition || drawdownCondition;
  }

  applyScalpingHybridLock(position: Position): boolean {
    // Combines partial profit scaling, time-based stop, and fixed take profit
    const timeCondition = this.isTimeBasedExitTriggered(position, this.defaultConfigs.time_based_stop);
    const profitCondition = this.isTakeProfitTriggered(position);
    const partialProfitCondition = position.unrealizedPnLPct > 1.0; // Quick profit target for scalping
    
    return timeCondition || profitCondition || partialProfitCondition;
  }
}

export default ProfitLockingEngine;
export type { Position, ProfitLockConfig, TradingConfig };