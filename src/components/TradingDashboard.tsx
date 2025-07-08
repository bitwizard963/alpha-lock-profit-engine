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
  WifiOff 
} from "lucide-react";

interface Position {
  id: string;
  symbol: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  trailingStopPrice: number;
  takeProfitPrice: number;
  profitLockMethod: string;
  timeHeld: string;
  edgeDecayScore: number;
  maxDrawdownFromPeak: number;
}

interface DashboardStats {
  totalEquity: number;
  unrealizedPnL: number;
  winRate: number;
  maxDrawdown: number;
  openPositions: number;
  realTrades: number;
}

const TradingDashboard = () => {
  const [isConnected, setIsConnected] = useState(true);
  const [currentPrice, setCurrentPrice] = useState(107314.68);
  const [priceChange24h, setPriceChange24h] = useState(0.30);
  const [prices, setPrices] = useState({
    'BTCUSDT': { price: 107314.68, change24h: 0.30 },
    'ETHUSDT': { price: 3976.45, change24h: 3.36 },
    'SOLUSDT': { price: 238.92, change24h: 1.63 }
  });

  // Reset data for clean start
  const [stats] = useState<DashboardStats>({
    totalEquity: 10000.00,
    unrealizedPnL: 0.00,
    winRate: 0,
    maxDrawdown: 0,
    openPositions: 0,
    realTrades: 0
  });

  const [positions, setPositions] = useState<Position[]>([]);

  // Update positions with real prices
  useEffect(() => {
    setPositions(prev => prev.map(position => {
      const symbol = position.symbol.replace('/', '');
      const currentPrice = prices[symbol]?.price || position.currentPrice;
      const priceDiff = currentPrice - position.entryPrice;
      const unrealizedPnL = position.side === 'long' ? priceDiff * position.size : -priceDiff * position.size;
      const unrealizedPnLPct = (unrealizedPnL / (position.entryPrice * position.size)) * 100;
      
      return {
        ...position,
        currentPrice,
        unrealizedPnL,
        unrealizedPnLPct
      };
    }));
  }, [prices]);

  // Fetch real prices from Binance API
  const fetchBinancePrices = async () => {
    try {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
      const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${JSON.stringify(symbols)}`);
      const data = await response.json();
      
      const newPrices: Record<string, { price: number; change24h: number }> = {};
      data.forEach((ticker: any) => {
        newPrices[ticker.symbol] = {
          price: parseFloat(ticker.lastPrice),
          change24h: parseFloat(ticker.priceChangePercent)
        };
      });
      
      setPrices(prev => ({ ...prev, ...newPrices }));
      if (newPrices['BTCUSDT']) {
        setCurrentPrice(newPrices['BTCUSDT'].price);
        setPriceChange24h(newPrices['BTCUSDT'].change24h);
      }
    } catch (error) {
      console.error('Failed to fetch prices:', error);
    }
  };

  // Fetch prices on mount and then every 5 seconds
  useEffect(() => {
    fetchBinancePrices();
    const interval = setInterval(fetchBinancePrices, 5000);
    return () => clearInterval(interval);
  }, []);

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

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Trading Dashboard</h1>
          <p className="text-muted-foreground">Focus on profits and performance</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <Wifi className="h-4 w-4 text-live" />
                <Badge variant="secondary" className="bg-live text-white">Live</Badge>
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

      {/* Current Price Display */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="text-sm text-muted-foreground mb-2">BTC/USDT</div>
            <div className="flex items-center justify-center gap-3 mb-3">
              <Activity className="h-6 w-6 text-primary" />
              <div className="text-4xl font-bold text-primary">
                {formatCurrency(currentPrice)}
              </div>
            </div>
            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
              <span>Bid: {formatCurrency(currentPrice - 0.21)}</span>
              <span>Ask: {formatCurrency(currentPrice + 0.21)}</span>
              <span className={priceChange24h >= 0 ? "text-profit" : "text-loss"}>
                {formatPercentage(priceChange24h)} (24h)
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Last Trade: {formatCurrency(currentPrice)}(0.000170 BTC)
            </div>
          </div>
        </CardContent>
      </Card>

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
            <p className="text-xs text-muted-foreground">+0.00%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unrealized P&L</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-profit">
              {formatCurrency(stats.unrealizedPnL)}
            </div>
            <p className="text-xs text-muted-foreground">{stats.openPositions} positions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Rate (Real)</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-profit">
              {stats.winRate}%
            </div>
            <p className="text-xs text-muted-foreground">{stats.realTrades} real trades</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Max Drawdown (Real)</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-loss">
              {stats.maxDrawdown}%
            </div>
            <p className="text-xs text-muted-foreground">Peak to trough</p>
          </CardContent>
        </Card>
      </div>

      {/* Open Positions */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Open Positions</CardTitle>
            <Badge variant="secondary">{positions.length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {positions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No open positions
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
                          Size: {position.size} | Entry: {formatCurrency(position.entryPrice)}
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
                      Method: {position.profitLockMethod.replace(/_/g, ' ')}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Edge Score: {position.edgeDecayScore.toFixed(2)}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Max DD: {position.maxDrawdownFromPeak.toFixed(2)}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Signals */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Recent Signals</CardTitle>
            <Badge variant="secondary">0</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No recent signals
          </div>
        </CardContent>
      </Card>

      {/* Exit Takeover Button */}
      <div className="flex justify-center">
        <Button 
          size="lg" 
          className="bg-foreground text-background hover:bg-foreground/90 px-8 py-3 rounded-full"
        >
          Exit takeover
        </Button>
      </div>
    </div>
  );
};

export default TradingDashboard;