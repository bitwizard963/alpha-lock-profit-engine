import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Zap,
  BarChart3
} from "lucide-react";

import TradingAnalytics from "./TradingAnalytics";

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
        console.log(`Realized PnL: $${position.unrealizedPnL.toFixed(2)}`);
        
        aiOrchestrator.updateReward(position.originalSignal, position.unrealizedPnL);
        
        // Update total equity with realized PnL
        setStats(prev => ({
          ...prev,
          totalEquity: prev.totalEquity + position.unrealizedPnL,
          realTrades: prev.realTrades + 1,
          winRate: calculateWinRate()
        }));
        
        console.log(`New total equity: $${stats.totalEquity + position.unrealizedPnL}`);
      });
    };

    initializeSystem();
    
    return () => {
      WebSocketDataService.unsubscribe(handleMarketDataUpdate);
    };
  }, []);

  const handleMarketDataUpdate = (data: MarketData) => {
    console.log('📊 Market data received:', Object.keys(data.tickers).length, 'tickers');
    setMarketData(data);
    featureEngine.updateData(data);
    
    // Update positions with current prices
    const currentPrices: Record<string, number> = {};
    Object.entries(data.tickers).forEach(([symbol, ticker]) => {
      currentPrices[symbol] = ticker.price;
      console.log(`💰 ${symbol}: $${ticker.price.toFixed(2)} (${ticker.change24h.toFixed(2)}%)`);
    });
    
    profitEngine.updatePositions(currentPrices);
    setPositions(profitEngine.getPositions());
    
    // Trigger trading cycle immediately with fresh data
    runTradingCycleWithData(data);
  };

  const runTradingCycleWithData = async (data: MarketData) => {
    console.log('🚀 Trading cycle with fresh data - symbols:', Object.keys(data.tickers));
    
    // Process each symbol
    for (const symbol of Object.keys(data.tickers)) {
      console.log(`🔍 Processing ${symbol}...`);
      
      // Extract features
      const symbolFeatures = featureEngine.extractFeatures(symbol);
      console.log(`📈 Features for ${symbol}:`, symbolFeatures ? 'EXTRACTED' : 'INSUFFICIENT_DATA');
      if (!symbolFeatures) {
        console.log(`❌ Skipping ${symbol} - need more price history`);
        return;
      }

      // Detect market regime
      const regime = featureEngine.detectRegime(symbol);
      console.log(`🎯 Regime for ${symbol}:`, regime ? `${regime.type} (${(regime.confidence*100).toFixed(1)}%)` : 'NONE');
      if (!regime) {
        console.log(`❌ Skipping ${symbol} - no regime detected`);
        return;
      }

      // Update UI state for BTC
      if (symbol === 'BTCUSDT') {
        setFeatures(symbolFeatures);
        setCurrentRegime(regime);
        console.log('📊 Updated BTC features for UI');
      }

      // Generate trading signal
      const signalResult = await aiOrchestrator.generateSignal(
        symbol,
        data.tickers[symbol].price,
        symbolFeatures,
        regime
      );

      console.log(`🧠 AI Signal for ${symbol}:`, signalResult ? `${signalResult.signal.action} (confidence: ${(signalResult.signal.confidence*100).toFixed(1)}%)` : 'NONE');

      if (signalResult && signalResult.signal.confidence > 0.7) { // Only take high confidence signals
        const { signal, signalId } = signalResult;
        console.log(`✅ EXECUTING TRADE: ${signal.action.toUpperCase()} ${signal.symbol} at $${signal.price} - Strategy: ${signal.strategy} - Confidence: ${(signal.confidence*100).toFixed(1)}%`);
        console.log(`💭 Reasoning: ${signal.reasoning}`);
        
        // Check if we already have too many positions for this symbol
        const existingPositions = profitEngine.getPositions().filter(p => p.symbol === signal.symbol);
        if (existingPositions.length >= 2) {
          console.log(`⚠️ Skipping signal - already have ${existingPositions.length} positions for ${signal.symbol}`);
          return;
        }
        
        // Execute trade (paper trading)
        const positionSize = calculatePositionSize(signal);
        console.log(`💰 Position size: ${positionSize.toFixed(4)}`);
        
        const positionId = profitEngine.addPosition(signal, positionSize, signalId);
        console.log(`📝 Created position: ${positionId}`);
        console.log(`📊 Current positions count: ${profitEngine.getPositions().length}`);
        
        setRecentSignals(prev => [signal, ...prev.slice(0, 9)]);
        setStats(prev => ({
          ...prev,
          aiSignals: prev.aiSignals + 1
        }));
        
        // Update positions immediately
        const updatedPositions = profitEngine.getPositions();
        setPositions(updatedPositions);
        console.log(`📈 Updated UI with ${updatedPositions.length} positions`);
      } else {
        console.log(`⏸️ No signal generated for ${symbol} or confidence too low (${signalResult ? (signalResult.signal.confidence*100).toFixed(1) : 'N/A'}%)`);
      }
    }

    // Update stats
    updateDashboardStats();
  };

  const runTradingCycle = () => {
    console.log('🔄 Trading cycle running, marketData available:', !!marketData);
    if (!marketData) return;
    runTradingCycleWithData(marketData);
  };

  const calculatePositionSize = (signal: TradingSignal): number => {
    // Use configurable risk management
    const accountValue = stats.totalEquity;
    const riskPerTrade = profitEngine.getConfig().riskPerTrade;
    const positionValue = accountValue * riskPerTrade;
    return positionValue / signal.price; // Convert USD to coin amount
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
      <Tabs defaultValue="dashboard" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="dashboard">Live Trading</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-8">
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
              <div className="text-sm text-muted-foreground mb-2">
                {Object.keys(marketData?.tickers || {}).length > 0 
                  ? `${Object.keys(marketData.tickers)[0]} Live Price` 
                  : 'Market Data Loading...'}
              </div>
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
              <div className="text-xs text-muted-foreground mt-2">
                Active Pairs: {marketData ? Object.keys(marketData.tickers).length : 0} | 
                Positions: {positions.length}/{profitEngine.getConfig().maxPositions}
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
            <p className="text-xs text-muted-foreground">
              {stats.activeStrategies} strategies | Risk: {(profitEngine.getConfig().riskPerTrade * 100).toFixed(1)}%/trade
            </p>
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
              AI system ready - scanning {marketData ? Object.keys(marketData.tickers).length : 0} pairs for signals
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
        </TabsContent>

        <TabsContent value="analytics">
          <TradingAnalytics />
        </TabsContent>
      </Tabs>
     </div>
   );
 };

export default TradingDashboard;