import { FeatureSet, MarketRegime } from './FeatureEngine';

interface Strategy {
  id: string;
  name: string;
  type: 'trend_following' | 'swing_trading' | 'momentum' | 'mean_reversion' | 'breakout' | 'scalping' | 'statistical_arbitrage' | 'contextual_bandits';
  weight: number;
  performance: number[];
  lastSignal?: TradingSignal;
}

interface TradingSignal {
  symbol: string;
  action: 'buy' | 'sell' | 'hold';
  confidence: number;
  strategy: string;
  price: number;
  timestamp: number;
  reasoning: string;
}

interface BanditArm {
  strategyId: string;
  wins: number;
  trials: number;
  alpha: number;
  beta: number;
}

class AIOrchestrator {
  private strategies: Map<string, Strategy> = new Map();
  private banditArms: Map<string, BanditArm> = new Map();
  private recentSignals: TradingSignal[] = [];
  private learningRate = 0.01;
  private explorationRate = 0.1;

  constructor() {
    this.initializeStrategies();
    this.initializeBandits();
  }

  private initializeStrategies() {
    const strategyConfigs = [
      { id: 'trend_following', name: 'Trend Following', type: 'trend_following' as const },
      { id: 'swing_trading', name: 'Swing Trading', type: 'swing_trading' as const },
      { id: 'momentum', name: 'Momentum', type: 'momentum' as const },
      { id: 'mean_reversion', name: 'Mean Reversion', type: 'mean_reversion' as const },
      { id: 'breakout', name: 'Breakout', type: 'breakout' as const },
      { id: 'scalping', name: 'Scalping', type: 'scalping' as const },
      { id: 'statistical_arbitrage', name: 'Statistical Arbitrage', type: 'statistical_arbitrage' as const },
      { id: 'contextual_bandits', name: 'Contextual Bandits', type: 'contextual_bandits' as const }
    ];

    strategyConfigs.forEach(config => {
      this.strategies.set(config.id, {
        ...config,
        weight: 1.0 / strategyConfigs.length,
        performance: []
      });
    });
  }

  private initializeBandits() {
    this.strategies.forEach((strategy, id) => {
      this.banditArms.set(id, {
        strategyId: id,
        wins: 1,
        trials: 1,
        alpha: 1,
        beta: 1
      });
    });
  }

  selectStrategy(features: FeatureSet, regime: MarketRegime): string {
    // Thompson Sampling for strategy selection
    const samples: { strategyId: string; sample: number }[] = [];

    this.banditArms.forEach((arm, strategyId) => {
      // Beta distribution sampling
      const sample = this.betaSample(arm.alpha, arm.beta);
      
      // Context-aware adjustment based on regime
      const contextAdjustment = this.getContextAdjustment(strategyId, features, regime);
      const adjustedSample = sample * contextAdjustment;
      
      samples.push({ strategyId, sample: adjustedSample });
    });

    // Sort by sample value and select top strategy
    samples.sort((a, b) => b.sample - a.sample);
    
    // Epsilon-greedy exploration
    if (Math.random() < this.explorationRate) {
      const randomIndex = Math.floor(Math.random() * samples.length);
      return samples[randomIndex].strategyId;
    }
    
    return samples[0].strategyId;
  }

  generateSignal(
    symbol: string, 
    price: number, 
    features: FeatureSet, 
    regime: MarketRegime
  ): TradingSignal | null {
    const selectedStrategy = this.selectStrategy(features, regime);
    const signal = this.executeStrategy(selectedStrategy, symbol, price, features, regime);
    
    if (signal && signal.confidence >= 0.3) { // Reduced from 0.6 to 0.3 for more signals
      console.log(`📶 Signal passed confidence threshold: ${signal.strategy} - ${signal.action} ${signal.symbol} (${(signal.confidence*100).toFixed(1)}%)`);
      this.recentSignals.push(signal);
      
      // Keep only recent signals
      if (this.recentSignals.length > 100) {
        this.recentSignals.shift();
      }
      
      return signal;
    } else if (signal) {
      console.log(`❌ Signal rejected - low confidence: ${signal.strategy} - ${signal.action} ${signal.symbol} (${(signal.confidence*100).toFixed(1)}% < 30%)`);
    }
    
    return null;
  }

  updateReward(signal: TradingSignal, profit: number) {
    const arm = this.banditArms.get(signal.strategy);
    if (!arm) return;

    // Binary reward: 1 for profit, 0 for loss
    const reward = profit > 0 ? 1 : 0;
    
    // Update Beta distribution parameters
    if (reward === 1) {
      arm.alpha += 1;
      arm.wins += 1;
    } else {
      arm.beta += 1;
    }
    arm.trials += 1;

    // Update strategy performance
    const strategy = this.strategies.get(signal.strategy);
    if (strategy) {
      strategy.performance.push(profit);
      if (strategy.performance.length > 50) {
        strategy.performance.shift();
      }
    }

    console.log(`Updated ${signal.strategy}: wins=${arm.wins}, trials=${arm.trials}, profit=${profit}`);
  }

  private executeStrategy(
    strategyId: string, 
    symbol: string, 
    price: number, 
    features: FeatureSet, 
    regime: MarketRegime
  ): TradingSignal {
    const baseSignal: TradingSignal = {
      symbol,
      action: 'hold',
      confidence: 0,
      strategy: strategyId,
      price,
      timestamp: Date.now(),
      reasoning: ''
    };

    switch (strategyId) {
      case 'trend_following':
        return this.trendFollowingStrategy(baseSignal, features);
      case 'momentum':
        return this.momentumStrategy(baseSignal, features);
      case 'mean_reversion':
        return this.meanReversionStrategy(baseSignal, features);
      case 'breakout':
        return this.breakoutStrategy(baseSignal, features);
      case 'scalping':
        return this.scalpingStrategy(baseSignal, features);
      case 'swing_trading':
        return this.swingTradingStrategy(baseSignal, features, regime);
      case 'statistical_arbitrage':
        return this.statisticalArbitrageStrategy(baseSignal, features);
      case 'contextual_bandits':
        return this.contextualBanditsStrategy(baseSignal, features, regime);
      default:
        return baseSignal;
    }
  }

  private trendFollowingStrategy(signal: TradingSignal, features: FeatureSet): TradingSignal {
    const trendStrength = Math.abs(features.trend);
    
    if (trendStrength > 0.01) { // Much more aggressive - reduced from 0.3
      signal.action = features.trend > 0 ? 'buy' : 'sell';
      signal.confidence = Math.min(trendStrength * 10, 1); // Increased multiplier
      signal.reasoning = `Trend detected: ${features.trend > 0 ? 'upward' : 'downward'} (${(features.trend * 100).toFixed(3)}%)`;
    }
    
    return signal;
  }

  private momentumStrategy(signal: TradingSignal, features: FeatureSet): TradingSignal {
    const momentumStrength = Math.abs(features.momentum);
    
    if (momentumStrength > 0.001) { // Much more aggressive - reduced from 0.02
      signal.action = features.momentum > 0 ? 'buy' : 'sell';
      signal.confidence = Math.min(momentumStrength * 50, 1); // Increased multiplier
      signal.reasoning = `Momentum signal: ${(features.momentum * 100).toFixed(3)}%`;
    }
    
    return signal;
  }

  private meanReversionStrategy(signal: TradingSignal, features: FeatureSet): TradingSignal {
    if (features.meanReversion > 0.4 && features.volatility > 0.3) {
      // Contrarian approach - buy when price is below mean, sell when above
      signal.action = features.trend < 0 ? 'buy' : 'sell';
      signal.confidence = features.meanReversion;
      signal.reasoning = `Mean reversion opportunity - price deviated ${(features.meanReversion * 100).toFixed(1)}%`;
    }
    
    return signal;
  }

  private breakoutStrategy(signal: TradingSignal, features: FeatureSet): TradingSignal {
    if (features.volatility > 0.6 && features.liquidity > 0.5) {
      const breakoutSignal = Math.abs(features.momentum) > 0.03;
      
      if (breakoutSignal) {
        signal.action = features.momentum > 0 ? 'buy' : 'sell';
        signal.confidence = Math.min(features.volatility + features.momentum, 1);
        signal.reasoning = `Breakout detected with high volatility (${(features.volatility * 100).toFixed(1)}%)`;
      }
    }
    
    return signal;
  }

  private scalpingStrategy(signal: TradingSignal, features: FeatureSet): TradingSignal {
    if (features.liquidity > 0.7 && features.volatility < 0.4) {
      const ofiSignal = Math.abs(features.ofi) > 0.3;
      
      if (ofiSignal) {
        signal.action = features.ofi > 0 ? 'buy' : 'sell';
        signal.confidence = Math.abs(features.ofi);
        signal.reasoning = `Order flow imbalance: ${(features.ofi * 100).toFixed(1)}%`;
      }
    }
    
    return signal;
  }

  private swingTradingStrategy(signal: TradingSignal, features: FeatureSet, regime: MarketRegime): TradingSignal {
    if (regime.type === 'ranging' && features.volatility > 0.2 && features.volatility < 0.6) {
      const swingSignal = Math.abs(features.meanReversion) > 0.3;
      
      if (swingSignal) {
        signal.action = features.trend < -0.1 ? 'buy' : 'sell';
        signal.confidence = features.meanReversion * regime.confidence;
        signal.reasoning = `Swing trade in ranging market`;
      }
    }
    
    return signal;
  }

  private statisticalArbitrageStrategy(signal: TradingSignal, features: FeatureSet): TradingSignal {
    if (Math.abs(features.correlation) > 0.7 && features.meanReversion > 0.5) {
      signal.action = features.correlation * features.trend < 0 ? 'buy' : 'sell';
      signal.confidence = Math.min(Math.abs(features.correlation) + features.meanReversion, 1) * 0.8;
      signal.reasoning = `Statistical arbitrage - correlation divergence`;
    }
    
    return signal;
  }

  private contextualBanditsStrategy(signal: TradingSignal, features: FeatureSet, regime: MarketRegime): TradingSignal {
    // Meta-strategy that combines multiple signals
    const signals = [
      features.trend * 0.3,
      features.momentum * 0.2,
      features.ofi * 0.2,
      features.meanReversion * -0.1,
      features.vpin * 0.2
    ];
    
    const combinedSignal = signals.reduce((sum, s) => sum + s, 0);
    
    if (Math.abs(combinedSignal) > 0.3) {
      signal.action = combinedSignal > 0 ? 'buy' : 'sell';
      signal.confidence = Math.min(Math.abs(combinedSignal) * regime.confidence, 1);
      signal.reasoning = `Multi-factor signal: ${combinedSignal.toFixed(3)}`;
    }
    
    return signal;
  }

  private getContextAdjustment(strategyId: string, features: FeatureSet, regime: MarketRegime): number {
    // Adjust strategy selection based on market regime
    const adjustments: Record<string, number> = {
      trend_following: regime.type === 'trending' ? 1.5 : 0.8,
      momentum: features.volatility > 0.5 ? 1.3 : 0.9,
      mean_reversion: regime.type === 'ranging' ? 1.4 : 0.7,
      breakout: features.volatility > 0.6 ? 1.6 : 0.6,
      scalping: features.liquidity > 0.7 ? 1.4 : 0.5,
      swing_trading: regime.type === 'ranging' ? 1.3 : 0.8,
      statistical_arbitrage: Math.abs(features.correlation) > 0.6 ? 1.2 : 0.9,
      contextual_bandits: 1.0 // Always neutral
    };

    return adjustments[strategyId] || 1.0;
  }

  private betaSample(alpha: number, beta: number): number {
    // Simple Beta distribution sampling using rejection method
    // In production, use a proper library like jStat
    const gamma1 = this.gammaSample(alpha);
    const gamma2 = this.gammaSample(beta);
    return gamma1 / (gamma1 + gamma2);
  }

  private gammaSample(shape: number): number {
    // Simplified gamma sampling for Thompson sampling
    // This is a basic implementation - use proper library in production
    if (shape < 1) {
      return this.gammaSample(shape + 1) * Math.pow(Math.random(), 1 / shape);
    }
    
    const d = shape - 1/3;
    const c = 1 / Math.sqrt(9 * d);
    
    while (true) {
      let x, v;
      do {
        x = this.normalSample();
        v = 1 + c * x;
      } while (v <= 0);
      
      v = v * v * v;
      const u = Math.random();
      
      if (u < 1 - 0.0331 * x * x * x * x) {
        return d * v;
      }
      
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v;
      }
    }
  }

  private normalSample(): number {
    // Box-Muller transform for normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  getStrategyPerformance(): Map<string, { wins: number; trials: number; winRate: number }> {
    const performance = new Map();
    
    this.banditArms.forEach((arm, strategyId) => {
      performance.set(strategyId, {
        wins: arm.wins,
        trials: arm.trials,
        winRate: arm.trials > 0 ? arm.wins / arm.trials : 0
      });
    });
    
    return performance;
  }

  getRecentSignals(): TradingSignal[] {
    return this.recentSignals.slice(-10);
  }
}

export default AIOrchestrator;
export type { Strategy, TradingSignal, BanditArm };
