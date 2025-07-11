import { MarketData, TickerData, OrderBookData } from './WebSocketDataService';
import SupabaseTradingService from './SupabaseTradingService';

interface FeatureSet {
  vvix: number;
  ofi: number;
  vpin: number;
  correlation: number;
  liquidity: number;
  volatility: number;
  momentum: number;
  meanReversion: number;
  trend: number;
  timestamp: number;
}

interface MarketRegime {
  type: 'trending' | 'ranging' | 'volatile' | 'stable';
  confidence: number;
  features: FeatureSet;
}

class FeatureEngine {
  private priceHistory: Record<string, number[]> = {};
  private volumeHistory: Record<string, number[]> = {};
  private orderBookHistory: Record<string, OrderBookData[]> = {};
  private maxHistoryLength = 200; // Increased for better analysis

  constructor() {
    // Dynamic initialization - no hardcoded symbols
    console.log('🔧 FeatureEngine initialized with dynamic symbol support');
  }

  updateData(marketData: MarketData) {
    // Update price and volume history
    Object.entries(marketData.tickers).forEach(([symbol, ticker]) => {
      // Initialize arrays for new symbols
      if (!this.priceHistory[symbol]) {
        this.priceHistory[symbol] = [];
        this.volumeHistory[symbol] = [];
        this.orderBookHistory[symbol] = [];
      }
      
      this.priceHistory[symbol].push(ticker.price);
      this.volumeHistory[symbol].push(ticker.volume);
      
      // Keep only recent history
      if (this.priceHistory[symbol].length > this.maxHistoryLength) {
        this.priceHistory[symbol].shift();
        this.volumeHistory[symbol].shift();
      }
    });

    // Update order book history
    Object.entries(marketData.orderBooks).forEach(([symbol, orderBook]) => {
      this.orderBookHistory[symbol].push(orderBook);
      
      if (this.orderBookHistory[symbol].length > this.maxHistoryLength) {
        this.orderBookHistory[symbol].shift();
      }
    });
  }

  extractFeatures(symbol: string): FeatureSet | null {
    const prices = this.priceHistory[symbol];
    const volumes = this.volumeHistory[symbol];
    const orderBooks = this.orderBookHistory[symbol];

    console.log(`🔢 Data for ${symbol}: prices=${prices?.length || 0}, volumes=${volumes?.length || 0}, orderBooks=${orderBooks?.length || 0}`);

    if (!prices || prices.length < 10) { // Minimum 10 data points for reliable analysis
      console.log(`⚠️ ${symbol} needs more data: ${prices?.length || 0}/10 prices`);
      return null; // Need minimum data
    }

    return {
      vvix: this.calculateVVIX(symbol),
      ofi: this.calculateOFI(symbol),
      vpin: this.calculateVPIN(symbol),
      correlation: this.calculateCorrelation(symbol),
      liquidity: this.calculateLiquidity(symbol),
      volatility: this.calculateVolatility(symbol),
      momentum: this.calculateMomentum(symbol),
      meanReversion: this.calculateMeanReversion(symbol),
      trend: this.calculateTrend(symbol),
      timestamp: Date.now()
    };
  }

  detectRegime(symbol: string): MarketRegime | null {
    const features = this.extractFeatures(symbol);
    if (!features) return null;

    // Simple regime detection logic
    let regimeType: 'trending' | 'ranging' | 'volatile' | 'stable' = 'stable';
    let confidence = 0.5;

    if (features.volatility > 0.7) {
      regimeType = 'volatile';
      confidence = features.volatility;
    } else if (Math.abs(features.trend) > 0.6) {
      regimeType = 'trending';
      confidence = Math.abs(features.trend);
    } else if (features.meanReversion > 0.6) {
      regimeType = 'ranging';
      confidence = features.meanReversion;
    }

    const regime: MarketRegime = {
      type: regimeType,
      confidence,
      features
    };

    // Save market features using local service (async, non-blocking)
    SupabaseTradingService.saveMarketFeatures(symbol, features, regime).catch(console.error);

    return regime;
  }

  private calculateVVIX(symbol: string): number {
    const prices = this.priceHistory[symbol];
    if (!prices || prices.length < 20) return 0;

    // Calculate volatility of volatility
    const returns = this.calculateReturns(prices);
    const volatilities: number[] = [];
    
    for (let i = 10; i < returns.length; i++) {
      const windowReturns = returns.slice(i - 10, i);
      const vol = this.standardDeviation(windowReturns);
      volatilities.push(vol);
    }

    return volatilities.length > 0 ? this.standardDeviation(volatilities) : 0;
  }

  private calculateOFI(symbol: string): number {
    const orderBooks = this.orderBookHistory[symbol];
    if (orderBooks.length < 2) return 0;

    const latest = orderBooks[orderBooks.length - 1];
    const previous = orderBooks[orderBooks.length - 2];

    // Order Flow Imbalance calculation
    const bidVolume = latest.bids.reduce((sum, [_, vol]) => sum + vol, 0);
    const askVolume = latest.asks.reduce((sum, [_, vol]) => sum + vol, 0);
    const prevBidVolume = previous.bids.reduce((sum, [_, vol]) => sum + vol, 0);
    const prevAskVolume = previous.asks.reduce((sum, [_, vol]) => sum + vol, 0);

    const bidFlow = bidVolume - prevBidVolume;
    const askFlow = askVolume - prevAskVolume;

    return (bidFlow - askFlow) / (bidFlow + askFlow + 1e-8);
  }

  private calculateVPIN(symbol: string): number {
    const volumes = this.volumeHistory[symbol];
    const prices = this.priceHistory[symbol];
    
    if (volumes.length < 20 || prices.length < 20) return 0;

    // Volume-Synchronized Probability of Informed Trading
    let buyVolume = 0;
    let sellVolume = 0;

    for (let i = 1; i < Math.min(volumes.length, prices.length); i++) {
      const priceChange = prices[i] - prices[i - 1];
      if (priceChange > 0) {
        buyVolume += volumes[i];
      } else {
        sellVolume += volumes[i];
      }
    }

    const totalVolume = buyVolume + sellVolume;
    return totalVolume > 0 ? Math.abs(buyVolume - sellVolume) / totalVolume : 0;
  }

  private calculateCorrelation(symbol: string): number {
    // Calculate correlation with BTC if not BTC
    const btcSymbol = 'BTCUSDT';
    if (symbol === btcSymbol) return 0;

    const prices = this.priceHistory[symbol];
    const btcPrices = this.priceHistory[btcSymbol];

    if (!prices || !btcPrices || prices.length < 20 || btcPrices.length < 20) return 0;

    const length = Math.min(prices.length, btcPrices.length, 20);
    const priceReturns = this.calculateReturns(prices.slice(-length));
    const btcReturns = this.calculateReturns(btcPrices.slice(-length));

    return this.pearsonCorrelation(priceReturns, btcReturns);
  }

  private calculateLiquidity(symbol: string): number {
    const orderBooks = this.orderBookHistory[symbol];
    if (!orderBooks || orderBooks.length === 0) return 0;

    const latest = orderBooks[orderBooks.length - 1];
    
    // Calculate bid-ask spread and depth
    const bestBid = latest.bids[0]?.[0] || 0;
    const bestAsk = latest.asks[0]?.[0] || 0;
    const spread = bestAsk - bestBid;
    const midPrice = (bestBid + bestAsk) / 2;
    
    const bidDepth = latest.bids.slice(0, 10).reduce((sum, [_, vol]) => sum + vol, 0);
    const askDepth = latest.asks.slice(0, 10).reduce((sum, [_, vol]) => sum + vol, 0);
    const totalDepth = bidDepth + askDepth;

    // Normalize liquidity score (higher is better)
    const spreadScore = midPrice > 0 ? 1 / (1 + spread / midPrice) : 0;
    const depthScore = Math.min(totalDepth / 1000, 1); // Normalize depth
    
    return (spreadScore + depthScore) / 2;
  }

  private calculateVolatility(symbol: string): number {
    const prices = this.priceHistory[symbol];
    if (!prices || prices.length < 2) return 0;

    const returns = this.calculateReturns(prices);
    return this.standardDeviation(returns);
  }

  private calculateMomentum(symbol: string): number {
    const prices = this.priceHistory[symbol];
    if (!prices || prices.length < 4) return 0;

    const recent = prices.slice(-2);
    const older = prices.slice(-4, -2);
    
    const recentAvg = recent.reduce((sum, p) => sum + p, 0) / recent.length;
    const olderAvg = older.reduce((sum, p) => sum + p, 0) / older.length;

    return olderAvg > 0 ? (recentAvg - olderAvg) / olderAvg : 0;
  }

  private calculateMeanReversion(symbol: string): number {
    const prices = this.priceHistory[symbol];
    if (!prices || prices.length < 3) return 0;

    const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const currentPrice = prices[prices.length - 1];
    const deviation = Math.abs(currentPrice - mean) / mean;

    // Higher score when price is far from mean (mean reversion opportunity)
    return Math.min(deviation * 2, 1);
  }

  private calculateTrend(symbol: string): number {
    const prices = this.priceHistory[symbol];
    if (!prices || prices.length < 10) return 0;

    // Simple linear regression slope
    const n = Math.min(prices.length, 20);
    const recentPrices = prices.slice(-n);
    
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    
    for (let i = 0; i < recentPrices.length; i++) {
      sumX += i;
      sumY += recentPrices[i];
      sumXY += i * recentPrices[i];
      sumXX += i * i;
    }
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const avgPrice = sumY / n;
    
    // Normalize slope
    return avgPrice > 0 ? slope / avgPrice : 0;
  }

  // Add method to get supported symbols
  getSupportedSymbols(): string[] {
    return Object.keys(this.priceHistory).filter(symbol => 
      this.priceHistory[symbol] && this.priceHistory[symbol].length >= 10
    );
  }

  // Add method to clear old data for symbols no longer tracked
  cleanupOldSymbols(activeSymbols: string[]) {
    const allSymbols = Object.keys(this.priceHistory);
    const symbolsToRemove = allSymbols.filter(symbol => !activeSymbols.includes(symbol));
    
    symbolsToRemove.forEach(symbol => {
      delete this.priceHistory[symbol];
      delete this.volumeHistory[symbol];
      delete this.orderBookHistory[symbol];
    });
    
    if (symbolsToRemove.length > 0) {
      console.log(`🧹 Cleaned up data for ${symbolsToRemove.length} inactive symbols`);
    }
  }

  private calculateReturns(prices: number[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] > 0) {
        returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
      }
    }
    return returns;
  }

  private standardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private pearsonCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) return 0;

    const n = x.length;
    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumXX = x.reduce((sum, val) => sum + val * val, 0);
    const sumYY = y.reduce((sum, val) => sum + val * val, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));

    return denominator !== 0 ? numerator / denominator : 0;
  }
}

export default FeatureEngine;
export type { FeatureSet, MarketRegime };
