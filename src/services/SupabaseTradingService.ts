import { localTradingService, type MarketData, type Trade, type Portfolio } from './LocalTradingService';
import { TradingSignal } from './AIOrchestrator';
import { Position } from './ProfitLockingEngine';
import { FeatureSet, MarketRegime } from './FeatureEngine';
import { supabase } from '../integrations/supabase/client';

class SupabaseTradingService {
  private currentSessionId: string | null = null;

  // Trading Signals
  async saveSignal(signal: TradingSignal, features: FeatureSet, regime: MarketRegime): Promise<string | null> {
    try {
      // Check if supabase client is available
      if (!supabase) {
        console.error('Supabase client not available');
        return null;
      }

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
      if (!supabase) {
        console.error('Supabase client not available');
        return [];
      }

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

  private parseTimeHeld(timeHeld: string): number {
    if (!timeHeld || typeof timeHeld !== 'string') {
      return 0;
    }

    let totalMinutes = 0;
    
    // Handle formats like "5m", "1h", "1h 30m", "2h 15m", etc.
    const timePattern = /(\d+)([hm])/g;
    let match;
    
    while ((match = timePattern.exec(timeHeld)) !== null) {
      const value = parseInt(match[1], 10);
      const unit = match[2];
      
      if (unit === 'h') {
        totalMinutes += value * 60;
      } else if (unit === 'm') {
        totalMinutes += value;
      }
    }
    
    return totalMinutes;
  }

  // Trading Positions
  async savePosition(position: Position, originalSignalId?: string): Promise<boolean> {
    try {
      if (!supabase) {
        console.error('Supabase client not available');
        return false;
      }

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
      if (!supabase) {
        console.error('Supabase client not available');
        return false;
      }

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
        // Check if it's a CORS or network error
        if (error.message?.includes('CORS') || error.message?.includes('fetch')) {
          console.error('CORS or network error updating position:', error);
          // Try to continue without failing completely
          return false;
        }
        console.error('Database error updating position:', error);
        return false;
      }

      return true;
    } catch (error) {
      if (error instanceof TypeError && (error.message.includes('Failed to fetch') || error.message.includes('CORS'))) {
        console.error('CORS or network error updating position - this is expected in development:', error);
        // Don't treat CORS errors as critical failures
        return false;
      } else {
        console.error('Error updating position:', error);
        return false;
      }
    }
  }

  async closePosition(position: Position, exitReason: string): Promise<boolean> {
    try {
      if (!supabase) {
        console.error('Supabase client not available');
        return false;
      }

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
      if (!supabase) {
        console.error('Supabase client not available');
        return [];
      }

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
      if (!supabase) {
        console.error('Supabase client not available');
        return false;
      }

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
      if (!supabase) {
        console.error('Supabase client not available');
        return [];
      }

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

  // Trading Sessions
  async startTradingSession(initialEquity: number, configuration: any): Promise<string | null> {
    try {
      if (!supabase) {
        console.error('Supabase client not available');
        return null;
      }

      const { data, error } = await supabase
        .from('trading_sessions')
        .insert({
          session_name: `Session ${new Date().toLocaleDateString()}`,
          initial_equity: initialEquity,
          configuration: configuration,
          status: 'active'
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error starting trading session:', error);
        return null;
      }

      this.currentSessionId = data.id;
      return data.id;
    } catch (error) {
      console.error('Error starting trading session:', error);
      return null;
    }
  }

  async getCurrentSession(): Promise<TradingSession | null> {
    try {
      if (!supabase) {
        console.error('Supabase client not available');
        return null;
      }

      const { data, error } = await supabase
        .from('trading_sessions')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.error('Error fetching current session:', error);
        return null;
      }

      this.currentSessionId = data.id;
      return {
        id: data.id,
        session_name: data.session_name,
        initial_equity: parseFloat(data.initial_equity.toString()),
        total_trades: data.total_trades,
        winning_trades: data.winning_trades,
        total_pnl: parseFloat(data.total_pnl.toString())
      };
    } catch (error) {
      console.error('Error fetching current session:', error);
      return null;
    }
  }

  async getTradingAnalytics(timeframe: 'day' | 'week' | 'month'): Promise<{
    positions: any[];
    signals: any[];
    features: any[];
  }> {
    try {
      if (!supabase) {
        console.error('Supabase client not available');
        return {
          positions: [],
          signals: [],
          features: []
        };
      }

      const now = new Date();
      let startDate = new Date();
      
      switch (timeframe) {
        case 'day':
          startDate.setDate(now.getDate() - 1);
          break;
        case 'week':
          startDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          startDate.setDate(now.getDate() - 30);
          break;
      }

      const [positionsResult, signalsResult, featuresResult] = await Promise.all([
        supabase
          .from('trading_positions')
          .select('*')
          .gte('created_at', startDate.toISOString())
          .order('created_at', { ascending: false }),
        supabase
          .from('trading_signals')
          .select('*')
          .gte('created_at', startDate.toISOString())
          .order('created_at', { ascending: false }),
        supabase
          .from('market_features')
          .select('*')
          .gte('created_at', startDate.toISOString())
          .order('created_at', { ascending: false })
      ]);

      return {
        positions: positionsResult.data || [],
        signals: signalsResult.data || [],
        features: featuresResult.data || []
      };
    } catch (error) {
      console.error('Error fetching trading analytics:', error);
      return {
        positions: [],
        signals: [],
        features: []
      };
    }
  }

  private dbRecordToPosition(record: any): Position {
    return {
      id: record.position_id,
      symbol: record.symbol,
      side: record.side as 'long' | 'short',
      size: parseFloat(record.size.toString()),
      entryPrice: parseFloat(record.entry_price.toString()),
      currentPrice: parseFloat(record.current_price.toString()),
      unrealizedPnL: parseFloat(record.unrealized_pnl.toString()),
      unrealizedPnLPct: parseFloat(record.unrealized_pnl_pct.toString()),
      trailingStopPrice: parseFloat(record.trailing_stop_price?.toString() || '0'),
      takeProfitPrice: parseFloat(record.take_profit_price?.toString() || '0'),
      profitLockMethod: record.profit_lock_method,
      timeHeld: `${record.time_held_minutes}m`,
      entryTime: new Date(record.entry_time).getTime(),
      edgeDecayScore: parseFloat(record.edge_decay_score?.toString() || '1'),
      maxDrawdownFromPeak: parseFloat(record.max_drawdown_from_peak?.toString() || '0'),
      peakPnL: parseFloat(record.peak_pnl?.toString() || '0'),
      atrValue: parseFloat(record.atr_value?.toString() || '0'),
      originalSignal: {
        symbol: record.symbol,
        action: 'buy',
        confidence: 0.5,
        strategy: 'unknown',
        price: parseFloat(record.entry_price.toString()),
        timestamp: new Date(record.entry_time).getTime(),
        reasoning: ''
      }
    };
  }

  // Market Features & Data
  async saveMarketFeatures(symbol: string, features: FeatureSet, regime: MarketRegime): Promise<boolean> {
    try {
      if (!supabase) {
        console.error('Supabase client not available');
        return false;
      }

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

// Update TradingSession interface to match what's being used
interface TradingSession {
  id: string;
  session_name?: string;
  initial_equity: number;
  total_trades: number;
  winning_trades: number;
  total_pnl: number;
}

export default new SupabaseTradingService();
export type { TradingSession, StrategyPerformance };