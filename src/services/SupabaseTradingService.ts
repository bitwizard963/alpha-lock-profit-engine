import { supabase } from '@/integrations/supabase/client';
import { TradingSignal } from './AIOrchestrator';
import { Position } from './ProfitLockingEngine';
import { FeatureSet, MarketRegime } from './FeatureEngine';
import { MarketData } from './WebSocketDataService';

interface TradingSession {
  id: string;
  session_name?: string;
  start_time: string;
  end_time?: string;
  initial_equity: number;
  final_equity?: number;
  total_trades: number;
  winning_trades: number;
  total_pnl: number;
  max_drawdown?: number;
  sharpe_ratio?: number;
  configuration: any;
  status: 'active' | 'stopped' | 'completed';
  created_at: string;
  updated_at: string;
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

class SupabaseTradingService {
  private currentSessionId: string | null = null;

  // Trading Signals
  async saveSignal(signal: TradingSignal, features: FeatureSet, regime: MarketRegime): Promise<string | null> {
    try {
      const signalData = {
        symbol: signal.symbol,
        action: signal.action,
        confidence: signal.confidence,
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
      const { error } = await supabase
        .from('trading_positions')
        .insert({
          position_id: position.id,
          symbol: position.symbol,
          side: position.side,
          size: position.size,
          entry_price: position.entryPrice,
          current_price: position.currentPrice,
          unrealized_pnl: position.unrealizedPnL,
          unrealized_pnl_pct: position.unrealizedPnLPct,
          trailing_stop_price: position.trailingStopPrice,
          take_profit_price: position.takeProfitPrice,
          profit_lock_method: position.profitLockMethod,
          time_held_minutes: this.parseTimeHeld(position.timeHeld),
          entry_time: new Date(position.entryTime).toISOString(),
          edge_decay_score: position.edgeDecayScore,
          max_drawdown_from_peak: position.maxDrawdownFromPeak,
          peak_pnl: position.peakPnL,
          atr_value: position.atrValue,
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
      const { error } = await supabase
        .from('trading_positions')
        .update({
          current_price: position.currentPrice,
          unrealized_pnl: position.unrealizedPnL,
          unrealized_pnl_pct: position.unrealizedPnLPct,
          trailing_stop_price: position.trailingStopPrice,
          take_profit_price: position.takeProfitPrice,
          time_held_minutes: this.parseTimeHeld(position.timeHeld),
          edge_decay_score: position.edgeDecayScore,
          max_drawdown_from_peak: position.maxDrawdownFromPeak,
          peak_pnl: position.peakPnL
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
      const { error } = await supabase
        .from('trading_positions')
        .update({
          status: 'closed',
          exit_time: new Date().toISOString(),
          exit_price: position.currentPrice,
          exit_reason: exitReason,
          realized_pnl: position.unrealizedPnL
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
      const { error } = await supabase
        .from('market_features')
        .insert({
          symbol,
          vvix: features.vvix,
          ofi: features.ofi,
          vpin: features.vpin,
          correlation: features.correlation,
          liquidity: features.liquidity,
          volatility: features.volatility,
          momentum: features.momentum,
          mean_reversion: features.meanReversion,
          trend: features.trend,
          regime_type: regime.type,
          regime_confidence: regime.confidence,
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

  async saveMarketData(marketData: MarketData): Promise<boolean> {
    try {
      const records = Object.entries(marketData.tickers).map(([symbol, ticker]) => ({
        symbol,
        price: ticker.price,
        volume: ticker.volume,
        change_24h: ticker.change24h,
        timestamp: new Date(ticker.timestamp).toISOString()
      }));

      const { error } = await supabase
        .from('market_data')
        .insert(records);

      if (error) {
        console.error('Error saving market data:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error saving market data:', error);
      return false;
    }
  }

  // Trading Sessions
  async startTradingSession(initialEquity: number, configuration: any): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('trading_sessions')
        .insert({
          session_name: `Session ${new Date().toLocaleDateString()}`,
          initial_equity: initialEquity,
          configuration
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

  async updateTradingSession(
    sessionId: string,
    totalTrades: number,
    winningTrades: number,
    totalPnl: number,
    finalEquity?: number,
    maxDrawdown?: number
  ): Promise<boolean> {
    try {
      const updates: any = {
        total_trades: totalTrades,
        winning_trades: winningTrades,
        total_pnl: totalPnl
      };

      if (finalEquity !== undefined) updates.final_equity = finalEquity;
      if (maxDrawdown !== undefined) updates.max_drawdown = maxDrawdown;

      const { error } = await supabase
        .from('trading_sessions')
        .update(updates)
        .eq('id', sessionId);

      if (error) {
        console.error('Error updating trading session:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error updating trading session:', error);
      return false;
    }
  }

  async getCurrentSession(): Promise<TradingSession | null> {
    try {
      const { data, error } = await supabase
        .from('trading_sessions')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching current session:', error);
        return null;
      }

      if (data) {
        this.currentSessionId = data.id;
        return {
          ...data,
          status: data.status as 'active' | 'stopped' | 'completed'
        };
      }

      return null;
    } catch (error) {
      console.error('Error fetching current session:', error);
      return null;
    }
  }

  // Analytics
  async getTradingAnalytics(timeframe: 'day' | 'week' | 'month' = 'day') {
    try {
      const startDate = new Date();
      switch (timeframe) {
        case 'day':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case 'week':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
      }

      const [positionsResult, signalsResult, featuresResult] = await Promise.all([
        supabase
          .from('trading_positions')
          .select('*')
          .gte('created_at', startDate.toISOString()),
        supabase
          .from('trading_signals')
          .select('*')
          .gte('created_at', startDate.toISOString()),
        supabase
          .from('market_features')
          .select('*')
          .gte('created_at', startDate.toISOString())
          .order('timestamp', { ascending: false })
          .limit(100)
      ]);

      return {
        positions: positionsResult.data || [],
        signals: signalsResult.data || [],
        features: featuresResult.data || []
      };
    } catch (error) {
      console.error('Error fetching analytics:', error);
      return { positions: [], signals: [], features: [] };
    }
  }

  // Helper methods
  private parseTimeHeld(timeHeld: string): number {
    const match = timeHeld.match(/(\d+)h\s*(\d+)m|(\d+)m/);
    if (!match) return 0;
    
    if (match[1] && match[2]) {
      return parseInt(match[1]) * 60 + parseInt(match[2]);
    } else if (match[3]) {
      return parseInt(match[3]);
    }
    
    return 0;
  }

  private dbRecordToPosition(record: any): Position {
    return {
      id: record.position_id,
      symbol: record.symbol,
      side: record.side,
      size: parseFloat(record.size),
      entryPrice: parseFloat(record.entry_price),
      currentPrice: parseFloat(record.current_price),
      unrealizedPnL: parseFloat(record.unrealized_pnl),
      unrealizedPnLPct: parseFloat(record.unrealized_pnl_pct),
      trailingStopPrice: parseFloat(record.trailing_stop_price),
      takeProfitPrice: parseFloat(record.take_profit_price),
      profitLockMethod: record.profit_lock_method,
      timeHeld: this.formatTimeHeld(record.time_held_minutes),
      entryTime: new Date(record.entry_time).getTime(),
      edgeDecayScore: parseFloat(record.edge_decay_score),
      maxDrawdownFromPeak: parseFloat(record.max_drawdown_from_peak),
      peakPnL: parseFloat(record.peak_pnl),
      atrValue: parseFloat(record.atr_value),
      originalSignal: {} as TradingSignal // This would need to be populated separately if needed
    };
  }

  private formatTimeHeld(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  }

  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }
}

export default new SupabaseTradingService();
export type { TradingSession, StrategyPerformance };