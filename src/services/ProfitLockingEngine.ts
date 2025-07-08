import { TradingSignal } from './AIOrchestrator';

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

  private defaultConfigs: Record<string, ProfitLockConfig> = {
    volatility_adaptive_trailing_stop: {
      method: 'volatility_adaptive_trailing_stop',
      atrMultiplier: 2.0,
      trailingPercent: 0.02,
      partialProfitLevels: [],
      timeBasedExitMinutes: 0,
      edgeDecayThreshold: 0.3,
      maxDrawdownPercent: 0.05
    },
    partial_profit_scaling: {
      method: 'partial_profit_scaling',
      atrMultiplier: 1.5,
      trailingPercent: 0.015,
      partialProfitLevels: [0.5, 0.75],
      timeBasedExitMinutes: 0,
      edgeDecayThreshold: 0.4,
      maxDrawdownPercent: 0.03
    },
    fixed_take_profit: {
      method: 'fixed_take_profit',
      atrMultiplier: 1.0,
      trailingPercent: 0.025,
      partialProfitLevels: [],
      timeBasedExitMinutes: 0,
      edgeDecayThreshold: 0.5,
      maxDrawdownPercent: 0.08
    },
    time_based_stop: {
      method: 'time_based_stop',
      atrMultiplier: 1.5,
      trailingPercent: 0.02,
      partialProfitLevels: [],
      timeBasedExitMinutes: 20,
      edgeDecayThreshold: 0.4,
      maxDrawdownPercent: 0.04
    },
    edge_decay_exit: {
      method: 'edge_decay_exit',
      atrMultiplier: 1.8,
      trailingPercent: 0.025,
      partialProfitLevels: [],
      timeBasedExitMinutes: 0,
      edgeDecayThreshold: 0.2,
      maxDrawdownPercent: 0.06
    },
    drawdown_trailing_stop: {
      method: 'drawdown_trailing_stop',
      atrMultiplier: 2.2,
      trailingPercent: 0.018,
      partialProfitLevels: [],
      timeBasedExitMinutes: 0,
      edgeDecayThreshold: 0.35,
      maxDrawdownPercent: 0.02
    }
  };

  constructor() {
    // Initialize price history
    ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].forEach(symbol => {
      this.priceHistory[symbol] = [];
    });
  }

  addPosition(signal: TradingSignal, size: number): string {
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
    console.log(`Added position ${positionId} using ${method}`);
    
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
    
    // Update price history
    this.priceHistory[position.symbol] = this.priceHistory[position.symbol] || [];
    this.priceHistory[position.symbol].push(currentPrice);
    if (this.priceHistory[position.symbol].length > 100) {
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
    position.maxDrawdownFromPeak = Math.max(position.maxDrawdownFromPeak, drawdownFromPeak);

    // Update time held
    const timeElapsed = Date.now() - position.entryTime;
    const minutes = Math.floor(timeElapsed / 60000);
    const hours = Math.floor(minutes / 60);
    position.timeHeld = hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;

    // Update edge decay score
    position.edgeDecayScore = this.calculateEdgeDecay(position);

    // Update trailing stop
    this.updateTrailingStop(position);
  }

  private checkExitConditions(position: Position) {
    const config = this.defaultConfigs[position.profitLockMethod];
    const reasons: string[] = [];

    // Check trailing stop
    if (this.isTrailingStopTriggered(position)) {
      reasons.push('Trailing stop triggered');
    }

    // Check take profit
    if (this.isTakeProfitTriggered(position)) {
      reasons.push('Take profit reached');
    }

    // Check time-based exit
    if (this.isTimeBasedExitTriggered(position, config)) {
      reasons.push('Time-based exit');
    }

    // Check edge decay
    if (position.edgeDecayScore < config.edgeDecayThreshold) {
      reasons.push('Edge decay threshold reached');
    }

    // Check max drawdown
    if (position.maxDrawdownFromPeak > config.maxDrawdownPercent) {
      reasons.push('Maximum drawdown exceeded');
    }

    // Execute exit if any condition is met
    if (reasons.length > 0) {
      this.exitPosition(position, reasons.join(', '));
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
    if (prices.length < 14) return 0.01; // Default ATR

    const highs = [...prices];
    const lows = [...prices];
    const closes = [...prices];

    let atrSum = 0;
    for (let i = 1; i < Math.min(14, prices.length); i++) {
      const high = highs[i];
      const low = lows[i];
      const prevClose = closes[i - 1];
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      atrSum += tr;
    }
    
    return atrSum / Math.min(13, prices.length - 1);
  }

  private calculateInitialStopPrice(signal: TradingSignal, config: ProfitLockConfig, atr: number): number {
    const atrDistance = atr * config.atrMultiplier;
    
    if (signal.action === 'buy') {
      return signal.price - atrDistance;
    } else {
      return signal.price + atrDistance;
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
    
    this.exitCallbacks.forEach(callback => {
      try {
        callback(position, reason);
      } catch (error) {
        console.error('Error in exit callback:', error);
      }
    });
    
    this.positions.delete(position.id);
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
export type { Position, ProfitLockConfig };