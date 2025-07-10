import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart3, 
  TrendingUp, 
  Target, 
  Clock,
  Database,
  Activity,
  PieChart,
  LineChart
} from "lucide-react";

import SupabaseTradingService, { StrategyPerformance, TradingSession } from "@/services/SupabaseTradingService";

interface AnalyticsData {
  positions: any[];
  signals: any[];
  features: any[];
}

const TradingAnalytics = () => {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>({ positions: [], signals: [], features: [] });
  const [strategyPerformance, setStrategyPerformance] = useState<StrategyPerformance[]>([]);
  const [currentSession, setCurrentSession] = useState<TradingSession | null>(null);
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month'>('day');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
    loadStrategyPerformance();
    loadCurrentSession();
  }, [timeframe]);

  const loadAnalytics = async () => {
    setIsLoading(true);
    try {
      const data = await SupabaseTradingService.getTradingAnalytics(timeframe);
      setAnalyticsData(data);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadStrategyPerformance = async () => {
    try {
      const performance = await SupabaseTradingService.getStrategyPerformance();
      setStrategyPerformance(performance);
    } catch (error) {
      console.error('Error loading strategy performance:', error);
    }
  };

  const loadCurrentSession = async () => {
    try {
      const session = await SupabaseTradingService.getCurrentSession();
      setCurrentSession(session);
    } catch (error) {
      console.error('Error loading current session:', error);
    }
  };

  const startNewSession = async () => {
    try {
      const sessionId = await SupabaseTradingService.startTradingSession(10000, {
        strategies: ['all'],
        riskLevel: 'medium',
        maxPositions: 10
      });
      if (sessionId) {
        await loadCurrentSession();
      }
    } catch (error) {
      console.error('Error starting new session:', error);
    }
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

  // Calculate analytics summary
  const totalSignals = analyticsData.signals.length;
  const totalPositions = analyticsData.positions.length;
  const closedPositions = analyticsData.positions.filter(p => p.status === 'closed');
  const winningTrades = closedPositions.filter(p => parseFloat(p.realized_pnl || 0) > 0).length;
  const winRate = closedPositions.length > 0 ? (winningTrades / closedPositions.length) * 100 : 0;
  const totalPnL = closedPositions.reduce((sum, p) => sum + parseFloat(p.realized_pnl || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Trading Analytics</h2>
          <p className="text-muted-foreground">Comprehensive AI trading performance analysis</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Tabs value={timeframe} onValueChange={(value) => setTimeframe(value as any)}>
            <TabsList>
              <TabsTrigger value="day">24H</TabsTrigger>
              <TabsTrigger value="week">7D</TabsTrigger>
              <TabsTrigger value="month">30D</TabsTrigger>
            </TabsList>
          </Tabs>
          
          {!currentSession && (
            <Button onClick={startNewSession} className="gap-2">
              <Activity className="h-4 w-4" />
              Start Session
            </Button>
          )}
        </div>
      </div>

      {/* Current Session */}
      {currentSession && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Active Trading Session
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Session</div>
                <div className="text-lg font-semibold">{currentSession.session_name}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Initial Equity</div>
                <div className="text-lg font-semibold">{formatCurrency(currentSession.initial_equity)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Trades</div>
                <div className="text-lg font-semibold">{currentSession.total_trades}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Session P&L</div>
                <div className={`text-lg font-semibold ${currentSession.total_pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                  {formatCurrency(currentSession.total_pnl)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Signals</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSignals}</div>
            <p className="text-xs text-muted-foreground">Generated in {timeframe}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Positions</CardTitle>
            <PieChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPositions}</div>
            <p className="text-xs text-muted-foreground">{closedPositions.length} closed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-profit">{winRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">{winningTrades}/{closedPositions.length} trades</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-profit' : 'text-loss'}`}>
              {formatCurrency(totalPnL)}
            </div>
            <p className="text-xs text-muted-foreground">Realized profits</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics */}
      <Tabs defaultValue="strategies" className="space-y-4">
        <TabsList>
          <TabsTrigger value="strategies">Strategy Performance</TabsTrigger>
          <TabsTrigger value="signals">Recent Signals</TabsTrigger>
          <TabsTrigger value="positions">Position History</TabsTrigger>
          <TabsTrigger value="features">Market Features</TabsTrigger>
        </TabsList>

        <TabsContent value="strategies">
          <Card>
            <CardHeader>
              <CardTitle>AI Strategy Performance</CardTitle>
            </CardHeader>
            <CardContent>
              {strategyPerformance.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No strategy performance data available
                </div>
              ) : (
                <div className="space-y-4">
                  {strategyPerformance.map((strategy) => (
                    <div key={strategy.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-semibold">{strategy.strategy_name}</h3>
                          <p className="text-sm text-muted-foreground">ID: {strategy.strategy_id}</p>
                        </div>
                        <Badge variant={strategy.win_rate > 0.5 ? "default" : "secondary"}>
                          {formatPercentage(strategy.win_rate * 100)}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">Wins / Trials</div>
                          <div className="font-medium">{strategy.wins} / {strategy.trials}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Total P&L</div>
                          <div className={`font-medium ${strategy.total_pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                            {formatCurrency(strategy.total_pnl)}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Alpha / Beta</div>
                          <div className="font-medium">{strategy.alpha.toFixed(2)} / {strategy.beta.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Last Updated</div>
                          <div className="font-medium">{new Date(strategy.last_updated).toLocaleDateString()}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="signals">
          <Card>
            <CardHeader>
              <CardTitle>Recent Trading Signals</CardTitle>
            </CardHeader>
            <CardContent>
              {analyticsData.signals.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No signals found for selected timeframe
                </div>
              ) : (
                <div className="space-y-3">
                  {analyticsData.signals.slice(0, 10).map((signal, index) => (
                    <div key={signal.id || index} className="border rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <Badge variant={signal.action === 'buy' ? "default" : "secondary"}>
                            {signal.action.toUpperCase()}
                          </Badge>
                          <div>
                            <div className="font-semibold">{signal.symbol}</div>
                            <div className="text-sm text-muted-foreground">{signal.strategy}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">{formatCurrency(parseFloat(signal.price))}</div>
                          <div className="text-sm text-muted-foreground">
                            {(parseFloat(signal.confidence) * 100).toFixed(1)}% confidence
                          </div>
                        </div>
                      </div>
                      {signal.reasoning && (
                        <div className="mt-2 text-sm text-muted-foreground">
                          {signal.reasoning}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="positions">
          <Card>
            <CardHeader>
              <CardTitle>Position History</CardTitle>
            </CardHeader>
            <CardContent>
              {analyticsData.positions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No positions found for selected timeframe
                </div>
              ) : (
                <div className="space-y-3">
                  {analyticsData.positions.slice(0, 10).map((position, index) => (
                    <div key={position.id || index} className="border rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <Badge variant={position.side === 'long' ? "default" : "secondary"}>
                            {position.side.toUpperCase()}
                          </Badge>
                          <div>
                            <div className="font-semibold">{position.symbol}</div>
                            <div className="text-sm text-muted-foreground">
                              Size: {parseFloat(position.size).toFixed(4)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant={position.status === 'open' ? "default" : "outline"}>
                            {position.status}
                          </Badge>
                          {position.status === 'closed' && position.realized_pnl && (
                            <div className={`text-sm mt-1 ${parseFloat(position.realized_pnl) >= 0 ? 'text-profit' : 'text-loss'}`}>
                              {formatCurrency(parseFloat(position.realized_pnl))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="features">
          <Card>
            <CardHeader>
              <CardTitle>Market Features Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {analyticsData.features.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No market features data available
                </div>
              ) : (
                <div className="space-y-3">
                  {analyticsData.features.slice(0, 5).map((feature, index) => (
                    <div key={feature.id || index} className="border rounded-lg p-3">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="font-semibold">{feature.symbol}</div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(feature.timestamp).toLocaleString()}
                          </div>
                        </div>
                        <Badge variant="outline">
                          {feature.regime_type} ({(parseFloat(feature.regime_confidence) * 100).toFixed(1)}%)
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div>Volatility: {parseFloat(feature.volatility).toFixed(3)}</div>
                        <div>Momentum: {parseFloat(feature.momentum).toFixed(3)}</div>
                        <div>Trend: {parseFloat(feature.trend).toFixed(3)}</div>
                        <div>OFI: {parseFloat(feature.ofi).toFixed(3)}</div>
                        <div>VPIN: {parseFloat(feature.vpin).toFixed(3)}</div>
                        <div>Liquidity: {parseFloat(feature.liquidity).toFixed(3)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TradingAnalytics;