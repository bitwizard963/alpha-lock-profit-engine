import { localTradingService, type MarketData, type Trade, type Portfolio } from './LocalTradingService';
import { TradingSignal } from './AIOrchestrator';
import { Position } from './ProfitLockingEngine';
import { FeatureSet, MarketRegime } from './FeatureEngine';
import { MarketData } from './WebSocketDataService';

interface TradingSession {
  id: string;
  session_name?: string;
}

// Re-export types for backward compatibility
export type { MarketData, Trade, Portfolio };

class SupabaseTradingService {
  private currentSessionId: string | null = null;

  // Trading Signals
  async saveSignal(signal: TradingSignal, features: FeatureSet, regime: MarketRegime): Promise<string | null> {
    try {
      // Clamp confidence value to ensure it's between 0 and 1
      const clampedConfidence = Math.min(Math.max(0, signal.confidence), 1);
      
      const signalData = {
        symbol: signal.symbol,
        action: signal.action,
        confidence: clampedConfidence,
        strategy: signal.strategy,
        price: signal.price,
        reasoning: signal.reasoning,
        features: features as any,
        market_regime: regime as any,
        timestamp: new Date(signal.timestamp).toISOString()
      };

      const { data, error } = await supabase
        .from('trading_signals')
        .insert(signalData)
        .select('id')
        .single();

      if (error) {
        console.error('Error saving signal:', error);
        return null;
      }

      return data.id;
    } catch (error) {
      console.error('Error saving signal:', error);
      return null;
    }
  }

  async getRecentSignals(limit: number = 50): Promise<TradingSignal[]> {
    try {
      const { data, error } = await supabase
        .from('trading_signals')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching signals:', error);
        return [];
      }

      return data.map(record => ({
        symbol: record.symbol,
        action: record.action as 'buy' | 'sell' | 'hold',
        confidence: parseFloat(record.confidence.toString()),
        strategy: record.strategy,
        price: parseFloat(record.price.toString()),
        timestamp: new Date(record.timestamp).getTime(),
        reasoning: record.reasoning || ''
      }));
    } catch (error) {
      console.error('Error fetching signals:', error);
      return [];
    }
  }

  // Trading Positions
  async savePosition(position: Position, originalSignalId?: string): Promise<boolean> {
    try {
      // Clamp numeric values to prevent overflow
      const clampToDecimal20_8 = (value: number) => Math.max(-999999999999.99999999, Math.min(999999999999.99999999, value || 0));
      const clampToDecimal8_4 = (value: number) => Math.max(-9999.9999, Math.min(9999.9999, value || 0));
      const clampToDecimal5_4 = (value: number) => Math.max(-9.9999, Math.min(9.9999, value || 0));
      
      const { error } = await supabase
        .from('trading_positions')
        .insert({
          position_id: position.id,
          symbol: position.symbol,
          side: position.side,
          size: clampToDecimal20_8(position.size),
          entry_price: clampToDecimal20_8(position.entryPrice),
          current_price: clampToDecimal20_8(position.currentPrice),
          unrealized_pnl: clampToDecimal20_8(position.unrealizedPnL),
          unrealized_pnl_pct: clampToDecimal8_4(position.unrealizedPnLPct),
          trailing_stop_price: clampToDecimal20_8(position.trailingStopPrice),
          take_profit_price: clampToDecimal20_8(position.takeProfitPrice),
          profit_lock_method: position.profitLockMethod,
          time_held_minutes: this.parseTimeHeld(position.timeHeld),
          entry_time: new Date(position.entryTime).toISOString(),
          edge_decay_score: clampToDecimal5_4(position.edgeDecayScore),
          max_drawdown_from_peak: clampToDecimal5_4(position.maxDrawdownFromPeak),
          peak_pnl: clampToDecimal20_8(position.peakPnL),
          atr_value: clampToDecimal20_8(position.atrValue),
          original_signal_id: originalSignalId,
          status: 'open'
        });

      if (error) {
        console.error('Error saving position:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error saving position:', error);
      return false;
    }
  }

  async updatePosition(position: Position): Promise<boolean> {
    try {
      // Clamp numeric values to prevent overflow
      const clampToDecimal20_8 = (value: number) => Math.max(-999999999999.99999999, Math.min(999999999999.99999999, value || 0));
      const clampToDecimal8_4 = (value: number) => Math.max(-9999.9999, Math.min(9999.9999, value || 0));
      const clampToDecimal5_4 = (value: number) => Math.max(-9.9999, Math.min(9.9999, value || 0));
      
      const { error } = await supabase
        .from('trading_positions')
        .update({
          current_price: clampToDecimal20_8(position.currentPrice),
          unrealized_pnl: clampToDecimal20_8(position.unrealizedPnL),
          unrealized_pnl_pct: clampToDecimal8_4(position.unrealizedPnLPct),
          trailing_stop_price: clampToDecimal20_8(position.trailingStopPrice),
          take_profit_price: clampToDecimal20_8(position.takeProfitPrice),
          time_held_minutes: this.parseTimeHeld(position.timeHeld),
          edge_decay_score: clampToDecimal5_4(position.edgeDecayScore),
          max_drawdown_from_peak: clampToDecimal5_4(position.maxDrawdownFromPeak),
          peak_pnl: clampToDecimal20_8(position.peakPnL)
        })
        .eq('position_id', position.id);

      if (error) {
        console.error('Error updating position:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error updating position:', error);
      return false;
    }
  }

  async closePosition(position: Position, exitReason: string): Promise<boolean> {
    try {
      // Clamp numeric values to prevent overflow
      const clampToDecimal20_8 = (value: number) => Math.max(-999999999999.99999999, Math.min(999999999999.99999999, value || 0));
      
      const { error } = await supabase
        .from('trading_positions')
        .update({
          status: 'closed',
          exit_time: new Date().toISOString(),
          exit_price: clampToDecimal20_8(position.currentPrice),
          exit_reason: exitReason,
          realized_pnl: clampToDecimal20_8(position.unrealizedPnL)
        })
        .eq('position_id', position.id);

      if (error) {
        console.error('Error closing position:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error closing position:', error);
      return false;
    }
  }

  async getOpenPositions(): Promise<Position[]> {
    try {
      const { data, error } = await supabase
        .from('trading_positions')
        .select('*')
        .eq('status', 'open')
        .order('entry_time', { ascending: false });

      if (error) {
        console.error('Error fetching positions:', error);
        return [];
      }

      return data.map(record => this.dbRecordToPosition(record));
    } catch (error) {
      console.error('Error fetching positions:', error);
      return [];
    }
  }

  // Strategy Performance
  async updateStrategyPerformance(
    strategyId: string, 
    strategyName: string, 
    wins: number, 
    trials: number, 
    totalPnl: number,
    alpha: number,
    beta: number,
    performanceHistory: number[]
  ): Promise<boolean> {
    try {
      const winRate = trials > 0 ? wins / trials : 0;

      const { error } = await supabase
        .from('strategy_performance')
        .upsert({
          strategy_id: strategyId,
          strategy_name: strategyName,
          wins,
          trials,
          total_pnl: totalPnl,
          win_rate: winRate,
          alpha,
          beta,
          performance_history: performanceHistory,
          last_updated: new Date().toISOString()
        });

      if (error) {
        console.error('Error updating strategy performance:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error updating strategy performance:', error);
      return false;
    }
  }

  async getStrategyPerformance(): Promise<StrategyPerformance[]> {
    try {
      const { data, error } = await supabase
        .from('strategy_performance')
        .select('*')
        .order('last_updated', { ascending: false });

      if (error) {
        console.error('Error fetching strategy performance:', error);
        return [];
      }

      return data.map(record => ({
        id: record.id,
        strategy_id: record.strategy_id,
        strategy_name: record.strategy_name,
        wins: record.wins,
        trials: record.trials,
        total_pnl: parseFloat(record.total_pnl.toString()),
        win_rate: parseFloat(record.win_rate.toString()),
        alpha: parseFloat(record.alpha.toString()),
        beta: parseFloat(record.beta.toString()),
        performance_history: Array.isArray(record.performance_history) ? record.performance_history as number[] : [],
        last_updated: record.last_updated,
        created_at: record.created_at
      }));
    } catch (error) {
      console.error('Error fetching strategy performance:', error);
      return [];
    }
  }

  // Market Features & Data
  async saveMarketFeatures(symbol: string, features: FeatureSet, regime: MarketRegime): Promise<boolean> {
    try {
      // Clamp all numeric values to prevent database overflow
      // Database columns are DECIMAL(10,6) so max value is 9999.999999
      const clampToDecimal10_6 = (value: number) => Math.max(-9999.999999, Math.min(9999.999999, value || 0));
      
      const { error } = await supabase
        .from('market_features')
        .insert({
          symbol,
          vvix: clampToDecimal10_6(features.vvix),
          ofi: clampToDecimal10_6(features.ofi),
          vpin: clampToDecimal10_6(features.vpin),
          correlation: clampToDecimal10_6(features.correlation),
          liquidity: clampToDecimal10_6(features.liquidity),
          volatility: clampToDecimal10_6(features.volatility),
          momentum: clampToDecimal10_6(features.momentum),
          mean_reversion: clampToDecimal10_6(features.meanReversion),
          trend: clampToDecimal10_6(features.trend),
          regime_type: regime.type,
          regime_confidence: Math.max(0, Math.min(1, regime.confidence || 0)),
          timestamp: new Date(features.timestamp).toISOString()
        });

      if (error) {
        console.error('Error saving market features:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error saving market features:', error);
      return false;
    }
  }
}

interface StrategyPerformance {
  id: string;
  strategy_id: string;
  strategy_name: string;
  wins: number;
  trials: number;
  total_pnl: number;
  win_rate: number;
  alpha: number;
  beta: number;
  performance_history: number[];
  last_updated: string;
  created_at: string;
}

export default new SupabaseTradingService();
export type { TradingSession, StrategyPerformance };