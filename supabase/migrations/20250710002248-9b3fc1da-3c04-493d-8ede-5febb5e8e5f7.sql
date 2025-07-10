-- Trading Analytics & Persistence Database Schema

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Trading Signals Table
CREATE TABLE public.trading_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('buy', 'sell', 'hold')),
  confidence DECIMAL(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  strategy TEXT NOT NULL,
  price DECIMAL(20,8) NOT NULL,
  reasoning TEXT,
  features JSONB NOT NULL,
  market_regime JSONB NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Trading Positions Table
CREATE TABLE public.trading_positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  position_id TEXT NOT NULL UNIQUE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  size DECIMAL(20,8) NOT NULL,
  entry_price DECIMAL(20,8) NOT NULL,
  current_price DECIMAL(20,8) NOT NULL,
  unrealized_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
  unrealized_pnl_pct DECIMAL(8,4) NOT NULL DEFAULT 0,
  trailing_stop_price DECIMAL(20,8),
  take_profit_price DECIMAL(20,8),
  profit_lock_method TEXT NOT NULL,
  time_held_minutes INTEGER NOT NULL DEFAULT 0,
  entry_time TIMESTAMP WITH TIME ZONE NOT NULL,
  exit_time TIMESTAMP WITH TIME ZONE,
  exit_price DECIMAL(20,8),
  exit_reason TEXT,
  realized_pnl DECIMAL(20,8),
  edge_decay_score DECIMAL(5,4),
  max_drawdown_from_peak DECIMAL(5,4),
  peak_pnl DECIMAL(20,8),
  atr_value DECIMAL(20,8),
  original_signal_id UUID REFERENCES public.trading_signals(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Strategy Performance Table
CREATE TABLE public.strategy_performance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  strategy_id TEXT NOT NULL,
  strategy_name TEXT NOT NULL,
  wins INTEGER NOT NULL DEFAULT 0,
  trials INTEGER NOT NULL DEFAULT 0,
  total_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
  win_rate DECIMAL(5,4) NOT NULL DEFAULT 0,
  alpha DECIMAL(10,6) NOT NULL DEFAULT 1,
  beta DECIMAL(10,6) NOT NULL DEFAULT 1,
  performance_history JSONB NOT NULL DEFAULT '[]',
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Market Features Table
CREATE TABLE public.market_features (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  symbol TEXT NOT NULL,
  vvix DECIMAL(10,6) NOT NULL,
  ofi DECIMAL(10,6) NOT NULL,
  vpin DECIMAL(10,6) NOT NULL,
  correlation DECIMAL(10,6) NOT NULL,
  liquidity DECIMAL(10,6) NOT NULL,
  volatility DECIMAL(10,6) NOT NULL,
  momentum DECIMAL(10,6) NOT NULL,
  mean_reversion DECIMAL(10,6) NOT NULL,
  trend DECIMAL(10,6) NOT NULL,
  regime_type TEXT NOT NULL,
  regime_confidence DECIMAL(5,4) NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. Market Data Table (for historical analysis)
CREATE TABLE public.market_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  symbol TEXT NOT NULL,
  price DECIMAL(20,8) NOT NULL,
  volume DECIMAL(20,8) NOT NULL,
  change_24h DECIMAL(8,4) NOT NULL,
  bid_volume DECIMAL(20,8),
  ask_volume DECIMAL(20,8),
  spread DECIMAL(20,8),
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 6. Trading Sessions Table
CREATE TABLE public.trading_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  session_name TEXT,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  end_time TIMESTAMP WITH TIME ZONE,
  initial_equity DECIMAL(20,8) NOT NULL,
  final_equity DECIMAL(20,8),
  total_trades INTEGER NOT NULL DEFAULT 0,
  winning_trades INTEGER NOT NULL DEFAULT 0,
  total_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
  max_drawdown DECIMAL(20,8),
  sharpe_ratio DECIMAL(8,4),
  configuration JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stopped', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_trading_signals_user_timestamp ON public.trading_signals(user_id, timestamp DESC);
CREATE INDEX idx_trading_signals_symbol_timestamp ON public.trading_signals(symbol, timestamp DESC);
CREATE INDEX idx_trading_positions_user_status ON public.trading_positions(user_id, status);
CREATE INDEX idx_trading_positions_symbol_status ON public.trading_positions(symbol, status);
CREATE INDEX idx_strategy_performance_user_strategy ON public.strategy_performance(user_id, strategy_id);
CREATE INDEX idx_market_features_symbol_timestamp ON public.market_features(symbol, timestamp DESC);
CREATE INDEX idx_market_data_symbol_timestamp ON public.market_data(symbol, timestamp DESC);
CREATE INDEX idx_trading_sessions_user_status ON public.trading_sessions(user_id, status);

-- Enable Row Level Security
ALTER TABLE public.trading_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_sessions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (initially permissive for development)
CREATE POLICY "Allow all operations on trading_signals" ON public.trading_signals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on trading_positions" ON public.trading_positions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on strategy_performance" ON public.strategy_performance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on market_features" ON public.market_features FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on market_data" ON public.market_data FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on trading_sessions" ON public.trading_sessions FOR ALL USING (true) WITH CHECK (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at columns
CREATE TRIGGER update_trading_positions_updated_at
  BEFORE UPDATE ON public.trading_positions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_trading_sessions_updated_at
  BEFORE UPDATE ON public.trading_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();