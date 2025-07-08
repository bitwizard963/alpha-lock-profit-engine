import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Target, 
  Shield, 
  Activity,
  Wifi,
  WifiOff,
  Brain,
  Zap
} from "lucide-react";

import WebSocketDataService, { MarketData } from "@/services/WebSocketDataService";
import FeatureEngine, { FeatureSet, MarketRegime } from "@/services/FeatureEngine";
import AIOrchestrator, { TradingSignal } from "@/services/AIOrchestrator";
import ProfitLockingEngine, { Position } from "@/services/ProfitLockingEngine";

interface DashboardStats {
  totalEquity: number;
  unrealizedPnL: number;
  winRate: number;
  maxDrawdown: number;
  openPositions: number;
  realTrades: number;
  aiSignals: number;
  activeStrategies: number;
}

const TradingDashboard = () => {
  const [isConnected, setIsConnected] = useState(true);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [recentSignals, setRecentSignals] = useState<TradingSignal[]>([]);
  const [currentRegime, setCurrentRegime] = useState<MarketRegime | null>(null);
  const [features, setFeatures] = useState<FeatureSet | null>(null);
  
  // AI Components
  const [featureEngine] = useState(() => new FeatureEngine());
  const [aiOrchestrator] = useState(() => new AIOrchestrator());
  const [profitEngine] = useState(() => new ProfitLockingEngine());

  const [stats, setStats] = useState<DashboardStats>({
    totalEquity: 10000.00,
    unrealizedPnL: 0.00,
    winRate: 0,
    maxDrawdown: 0,
    openPositions: 0,
    realTrades: 0,
    aiSignals: 0,
    activeStrategies: 8
  });

  useEffect(() => {
    // Initialize AI trading system
    const initializeSystem = () => {
      // Subscribe to WebSocket data
      WebSocketDataService.subscribe(handleMarketDataUpdate);
      
      // Setup profit locking callbacks
      profitEngine.onPositionExit((position, reason) => {
        console.log(`Position ${position.id} exited: ${reason}`);
        aiOrchestrator.updateReward(position.originalSignal, position.unrealizedPnL);
        setStats(prev => ({
          ...prev,
          realTrades: prev.realTrades + 1,
          winRate: calculateWinRate()
        }));
      });
    };

    initializeSystem();
    
    // Main trading loop - runs every second
    const tradingLoop = setInterval(() => {
      runTradingCycle();
    }, 1000);

    return () => {
      clearInterval(tradingLoop);
      WebSocketDataService.unsubscribe(handleMarketDataUpdate);
    };
  }, []);

  const handleMarketDataUpdate = (data: MarketData) => {
    setMarketData(data);
    featureEngine.updateData(data);
    
    // Update positions with current prices
    const currentPrices: Record<string, number> = {};
    Object.entries(data.tickers).forEach(([symbol, ticker]) => {
      currentPrices[symbol] = ticker.price;
    });
    
    profitEngine.updatePositions(currentPrices);
    setPositions(profitEngine.getPositions());
  };

  const runTradingCycle = () => {
    if (!marketData) return;

    // Process each symbol
    Object.keys(marketData.tickers).forEach(symbol => {
      // Extract features
      const symbolFeatures = featureEngine.extractFeatures(symbol);
      if (!symbolFeatures) return;

      // Detect market regime
      const regime = featureEngine.detectRegime(symbol);
      if (!regime) return;

      // Update UI state for BTC
      if (symbol === 'BTCUSDT') {
        setFeatures(symbolFeatures);
        setCurrentRegime(regime);
      }

      // Generate trading signal
      const signal = aiOrchestrator.generateSignal(
        symbol,
        marketData.tickers[symbol].price,
        symbolFeatures,
        regime
      );

      if (signal) {
        console.log(`AI Signal: ${signal.action} ${signal.symbol} at ${signal.price} (confidence: ${signal.confidence})`);
        
        // Execute trade (paper trading)
        const positionSize = calculatePositionSize(signal);
        const positionId = profitEngine.addPosition(signal, positionSize);
        
        setRecentSignals(prev => [signal, ...prev.slice(0, 9)]);
        setStats(prev => ({
          ...prev,
          aiSignals: prev.aiSignals + 1
        }));
      }
    });

    // Update stats
    updateDashboardStats();
  };

  const calculatePositionSize = (signal: TradingSignal): number => {
    // Fractional Kelly sizing
    const baseSize = 0.1; // 10% of capital
    return baseSize * signal.confidence;
  };

  const calculateWinRate = (): number => {
    const performance = aiOrchestrator.getStrategyPerformance();
    let totalWins = 0;
    let totalTrades = 0;
    
    performance.forEach(perf => {
      totalWins += perf.wins;
      totalTrades += perf.trials;
    });
    
    return totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
  };

  const updateDashboardStats = () => {
    const openPositions = profitEngine.getPositions();
    const totalUnrealizedPnL = openPositions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);
    
    setStats(prev => ({
      ...prev,
      unrealizedPnL: totalUnrealizedPnL,
      openPositions: openPositions.length,
      winRate: calculateWinRate()
    }));
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const currentPrice = marketData?.tickers['BTCUSDT']?.price || 0;
  const priceChange24h = marketData?.tickers['BTCUSDT']?.change24h || 0;

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Quantum Nexus AI Trader</h1>
          <p className="text-muted-foreground">v2.0 - Real-time AI-driven crypto trading</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <Wifi className="h-4 w-4 text-live" />
                <Badge variant="secondary" className="bg-live text-white">Live AI</Badge>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-disconnect" />
                <Badge variant="destructive">Disconnected</Badge>
              </>
            )}
          </div>
          <Button 
            variant={isConnected ? "destructive" : "default"}
            onClick={() => setIsConnected(!isConnected)}
          >
            {isConnected ? "Disconnect" : "Connect"}
          </Button>
        </div>
      </div>

      {/* Current Price & AI Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-2">BTC/USDT Live Price</div>
              <div className="flex items-center justify-center gap-3 mb-3">
                <Activity className="h-6 w-6 text-primary" />
                <div className="text-4xl font-bold text-primary">
                  {formatCurrency(currentPrice)}
                </div>
              </div>
              <div className={`text-lg ${priceChange24h >= 0 ? "text-profit" : "text-loss"}`}>
                {formatPercentage(priceChange24h)} (24h)
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-2">AI System Status</div>
              <div className="flex items-center justify-center gap-3 mb-3">
                <Brain className="h-6 w-6 text-primary" />
                <div className="text-2xl font-bold text-primary">
                  {currentRegime?.type.toUpperCase() || 'ANALYZING'}
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                Regime Confidence: {((currentRegime?.confidence || 0) * 100).toFixed(1)}%
              </div>
              {features && (
                <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                  <div>VVIX: {features.vvix.toFixed(3)}</div>
                  <div>OFI: {features.ofi.toFixed(3)}</div>
                  <div>VPIN: {features.vpin.toFixed(3)}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Equity</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-profit">
              {formatCurrency(stats.totalEquity)}
            </div>
            <p className="text-xs text-muted-foreground">{stats.activeStrategies} strategies active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unrealized P&L</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.unrealizedPnL >= 0 ? 'text-profit' : 'text-loss'}`}>
              {formatCurrency(stats.unrealizedPnL)}
            </div>
            <p className="text-xs text-muted-foreground">{stats.openPositions} positions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AI Win Rate</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-profit">
              {stats.winRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">{stats.realTrades} AI trades</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AI Signals</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {stats.aiSignals}
            </div>
            <p className="text-xs text-muted-foreground">Total generated</p>
          </CardContent>
        </Card>
      </div>

      {/* Live Positions */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Live AI Positions</CardTitle>
            <Badge variant="secondary">{positions.length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {positions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              AI system ready - waiting for signals
            </div>
          ) : (
            <div className="space-y-4">
              {positions.map((position) => (
                <div key={position.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <Badge variant={position.side === "long" ? "default" : "secondary"}>
                        {position.side.toUpperCase()}
                      </Badge>
                      <div>
                        <div className="font-semibold">{position.symbol}</div>
                        <div className="text-sm text-muted-foreground">
                          Size: {position.size.toFixed(4)} | Entry: {formatCurrency(position.entryPrice)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${position.unrealizedPnL >= 0 ? 'text-profit' : 'text-loss'}`}>
                        {formatCurrency(position.unrealizedPnL)}
                      </div>
                      <div className={`text-sm ${position.unrealizedPnLPct >= 0 ? 'text-profit' : 'text-loss'}`}>
                        {formatPercentage(position.unrealizedPnLPct)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Current Price</div>
                      <div className="font-medium">{formatCurrency(position.currentPrice)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Trailing Stop</div>
                      <div className="font-medium text-warning">{formatCurrency(position.trailingStopPrice)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Take Profit</div>
                      <div className="font-medium text-success">{formatCurrency(position.takeProfitPrice)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Time Held</div>
                      <div className="font-medium">{position.timeHeld}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2 border-t">
                    <Badge variant="outline" className="text-xs">
                      {position.profitLockMethod.replace(/_/g, ' ')}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Edge Score: {position.edgeDecayScore.toFixed(2)}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Max DD: {(position.maxDrawdownFromPeak * 100).toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent AI Signals */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Recent AI Signals</CardTitle>
            <Badge variant="secondary">{recentSignals.length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {recentSignals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              AI analyzing market - no signals yet
            </div>
          ) : (
            <div className="space-y-3">
              {recentSignals.map((signal, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex items-center gap-3">
                    <Badge variant={signal.action === 'buy' ? 'default' : 'secondary'}>
                      {signal.action.toUpperCase()}
                    </Badge>
                    <div>
                      <div className="font-medium">{signal.symbol}</div>
                      <div className="text-sm text-muted-foreground">{signal.strategy}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatCurrency(signal.price)}</div>
                    <div className="text-sm text-muted-foreground">
                      {(signal.confidence * 100).toFixed(0)}% confidence
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TradingDashboard;