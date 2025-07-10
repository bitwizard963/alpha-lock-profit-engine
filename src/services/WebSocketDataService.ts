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

class WebSocketDataService {
  private ws: WebSocket | null = null;
  private subscribers: Set<(data: MarketData) => void> = new Set();
  private marketData: MarketData = {
    tickers: {},
    orderBooks: {},
    lastUpdate: 0
  };
  private reconnectInterval = 5000;
  private symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

  constructor() {
    this.connect();
  }

  private connect() {
    try {
      console.log('Attempting WebSocket connection...');
      // Using Binance WebSocket for real-time data
      const streams = this.symbols.map(s => `${s.toLowerCase()}@ticker`).join('/');
      const wsUrl = `wss://stream.binance.com:9443/ws/${streams}`;
      console.log('Connecting to:', wsUrl);
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('✅ WebSocket connected successfully!');
        this.subscribeToOrderBooks();
      };
      
      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };
      
      this.ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        setTimeout(() => this.connect(), this.reconnectInterval);
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      setTimeout(() => this.connect(), this.reconnectInterval);
    }
  }

  private subscribeToOrderBooks() {
    // Subscribe to depth streams for order book data
    this.symbols.forEach(symbol => {
      const depthWs = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@depth20@100ms`);
      depthWs.onmessage = (event) => {
        const data = JSON.parse(event.data);
        this.updateOrderBook(symbol, data);
      };
    });
  }

  private handleMessage(data: any) {
    if (data.e === '24hrTicker') {
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
    localTradingService.saveMarketData(this.marketData).catch(console.error);
    
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
        console.error('Error in subscriber callback:', error);
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

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

export default new WebSocketDataService();
export type { MarketData, TickerData, OrderBookData };