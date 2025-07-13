interface TickerData {
  symbol: string;
  price: number;
  change24h: number;
  volume: number;
  timestamp: number;
}

interface OrderBookData {
  symbol: string;
  bids: [number, number][];
  asks: [number, number][];
  timestamp: number;
}

interface MarketData {
  tickers: Record<string, TickerData>;
  orderBooks: Record<string, OrderBookData>;
  lastUpdate: number;
}

import { localTradingService } from './LocalTradingService';

interface TradingPair {
  symbol: string;
  volume24h: number;
  priceChangePercent: number;
  quoteVolume: number;
}

class WebSocketDataService {
  private ws: WebSocket | null = null;
  private subscribers: Set<(data: MarketData) => void> = new Set();
  private marketData: MarketData = {
    tickers: {},
    orderBooks: {},
    lastUpdate: 0
  };
  private reconnectInterval = 5000;
  private symbols: string[] = [];
  private maxSymbols = 20; // Top 20 pairs by volume
  private symbolUpdateInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeTopPairs();
  }

  private async initializeTopPairs() {
    try {
      console.log('🔍 Fetching top trading pairs...');
      
      // Fetch 24hr ticker statistics to get top pairs by volume
      // Use proxy to avoid CORS issues in development
      const apiUrl = import.meta.env.DEV 
        ? '/api/binance/api/v3/ticker/24hr'
        : 'https://api.binance.com/api/v3/ticker/24hr';
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const tickers: TradingPair[] = await response.json();
      
      // Filter for USDT pairs only and sort by quote volume
      const usdtPairs = tickers
        .filter(ticker => 
          ticker.symbol.endsWith('USDT') && 
          !ticker.symbol.includes('UP') && 
          !ticker.symbol.includes('DOWN') &&
          !ticker.symbol.includes('BULL') &&
          !ticker.symbol.includes('BEAR') &&
          parseFloat(ticker.quoteVolume.toString()) > 10000000 // Min $10M volume
        )
        .sort((a, b) => parseFloat(b.quoteVolume.toString()) - parseFloat(a.quoteVolume.toString()))
        .slice(0, this.maxSymbols);

      this.symbols = usdtPairs.map(pair => pair.symbol);
      
      console.log(`✅ Selected top ${this.symbols.length} trading pairs:`, this.symbols);
      console.log('📊 Volume leaders:', usdtPairs.slice(0, 5).map(p => 
        `${p.symbol}: $${(parseFloat(p.quoteVolume.toString()) / 1000000).toFixed(1)}M`
      ));
      
      // Connect to WebSocket with selected pairs
      this.connect();
      
      // Update pairs every hour
      this.symbolUpdateInterval = setInterval(() => {
        this.initializeTopPairs();
      }, 3600000);
      
    } catch (error) {
      console.error('❌ Error fetching top pairs, falling back to defaults:', error);
      // Fallback to major pairs if API fails
      this.symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'SOLUSDT', 'XRPUSDT', 'DOTUSDT', 'DOGEUSDT'];
      this.connect();
    }
  }

  private connect() {
    if (this.symbols.length === 0) {
      console.log('⏳ Waiting for symbols to be loaded...');
      return;
    }

    try {
      // Close existing connection
      if (this.ws) {
        this.ws.close();
      }

      console.log(`🔌 Connecting to WebSocket with ${this.symbols.length} symbols...`);
      
      // Use combined streams endpoint for multiple symbols
      const streams = this.symbols.map(s => `${s.toLowerCase()}@ticker`).join('/');
      const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`;
      
      console.log('🌐 WebSocket URL:', wsUrl);
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log(`✅ WebSocket connected successfully with ${this.symbols.length} pairs!`);
        this.subscribeToOrderBooks();
      };
      
      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };
      
      this.ws.onclose = (event) => {
        console.log(`🔌 WebSocket disconnected (code: ${event.code}), reconnecting...`);
        setTimeout(() => this.connect(), this.reconnectInterval);
      };
      
      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
      };
    } catch (error) {
      console.error('❌ Failed to connect WebSocket:', error);
      setTimeout(() => this.connect(), this.reconnectInterval);
    }
  }

  private subscribeToOrderBooks() {
    // Subscribe to depth streams for order book data (limit to top 5 for performance)
    const topSymbols = this.symbols.slice(0, 5);
    
    if (topSymbols.length > 0) {
      try {
        // Use combined streams for order book data
        const depthStreams = topSymbols.map(s => `${s.toLowerCase()}@depth20@100ms`).join('/');
        const depthWsUrl = `wss://stream.binance.com:9443/stream?streams=${depthStreams}`;
        
        const depthWs = new WebSocket(depthWsUrl);
        
        depthWs.onopen = () => {
          console.log(`📊 Order book streams connected for ${topSymbols.length} symbols`);
        };
        
        depthWs.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.stream && data.data) {
            // Extract symbol from stream name (e.g., "btcusdt@depth20@100ms" -> "BTCUSDT")
            const symbol = data.stream.split('@')[0].toUpperCase() + 'T';
            this.updateOrderBook(symbol, data.data);
          }
        };
        
        depthWs.onerror = (error) => {
          console.error(`❌ Order book streams error:`, error);
        };
        
        depthWs.onclose = () => {
          console.log(`📊 Order book streams disconnected`);
          // Reconnect after delay
          setTimeout(() => this.subscribeToOrderBooks(), 5000);
        };
      } catch (error) {
        console.error(`❌ Failed to connect order book streams:`, error);
      }
    }
  }

  private handleMessage(data: any) {
    // Handle combined stream format
    if (data.stream && data.data) {
      if (data.data.e === '24hrTicker') {
        this.updateTicker(data.data);
      }
    }
    // Handle single stream format (fallback)
    else if (data.e === '24hrTicker') {
      this.updateTicker(data);
    }
  }

  private updateTicker(data: any) {
    const tickerData: TickerData = {
      symbol: data.s,
      price: parseFloat(data.c),
      change24h: parseFloat(data.P),
      volume: parseFloat(data.v),
      timestamp: Date.now()
    };
    
    this.marketData.tickers[data.s] = tickerData;
    this.marketData.lastUpdate = Date.now();
    
    // Save market data using local service
    localTradingService.saveMarketData({
      symbol: data.s,
      price: tickerData.price,
      volume: tickerData.volume,
      timestamp: new Date().toISOString(),
      change: tickerData.change24h,
      changePercent: tickerData.change24h
    }).catch(console.error);
    
    this.notifySubscribers();
  }

  private updateOrderBook(symbol: string, data: any) {
    const orderBookData: OrderBookData = {
      symbol,
      bids: data.bids?.map((bid: string[]) => [parseFloat(bid[0]), parseFloat(bid[1])]) || [],
      asks: data.asks?.map((ask: string[]) => [parseFloat(ask[0]), parseFloat(ask[1])]) || [],
      timestamp: Date.now()
    };
    
    this.marketData.orderBooks[symbol] = orderBookData;
    this.marketData.lastUpdate = Date.now();
    this.notifySubscribers();
  }

  private notifySubscribers() {
    this.subscribers.forEach(callback => {
      try {
        callback(this.marketData);
      } catch (error) {
        console.error('❌ Error in subscriber callback:', error);
      }
    });
  }

  subscribe(callback: (data: MarketData) => void) {
    this.subscribers.add(callback);
    // Send current data immediately
    if (Object.keys(this.marketData.tickers).length > 0) {
      callback(this.marketData);
    }
  }

  unsubscribe(callback: (data: MarketData) => void) {
    this.subscribers.delete(callback);
  }

  getCurrentData(): MarketData {
    return this.marketData;
  }

  getActiveSymbols(): string[] {
    return [...this.symbols];
  }

  updateMaxSymbols(count: number) {
    if (count > 0 && count <= 50) {
      this.maxSymbols = count;
      console.log(`📊 Updated max symbols to ${count}, refreshing pairs...`);
      this.initializeTopPairs();
    }
  }

  disconnect() {
    if (this.symbolUpdateInterval) {
      clearInterval(this.symbolUpdateInterval);
    }
    if (this.ws) {
      this.ws.close();
    }
  }
}

export default new WebSocketDataService();
export type { MarketData, TickerData, OrderBookData };