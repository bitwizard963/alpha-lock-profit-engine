// Local storage-based trading service to replace Supabase
export interface MarketData {
  id: string;
  symbol: string;
  price: number;
  volume: number;
  timestamp: string;
  change: number;
  changePercent: number;
}

export interface Trade {
  id: string;
  symbol: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  timestamp: string;
  status: 'pending' | 'completed' | 'cancelled';
}

export interface Portfolio {
  id: string;
  symbol: string;
  quantity: number;
  averagePrice: number;
  currentValue: number;
  totalReturn: number;
  returnPercent: number;
}

class LocalTradingService {
  private readonly MARKET_DATA_KEY = 'trading_market_data';
  private readonly TRADES_KEY = 'trading_trades';
  private readonly PORTFOLIO_KEY = 'trading_portfolio';

  // Market Data Methods
  async saveMarketData(data: Omit<MarketData, 'id'>): Promise<MarketData> {
    try {
      const marketData: MarketData = {
        ...data,
        id: this.generateId(),
      };

      const existingData = this.getStoredData<MarketData[]>(this.MARKET_DATA_KEY) || [];
      
      // Keep only the last 1000 records to prevent storage overflow
      const updatedData = [marketData, ...existingData].slice(0, 1000);
      
      this.setStoredData(this.MARKET_DATA_KEY, updatedData);
      
      return marketData;
    } catch (error) {
      console.error('Error saving market data:', error);
      throw new Error('Failed to save market data');
    }
  }

  async getMarketData(symbol?: string, limit: number = 100): Promise<MarketData[]> {
    try {
      const allData = this.getStoredData<MarketData[]>(this.MARKET_DATA_KEY) || [];
      
      let filteredData = symbol 
        ? allData.filter(data => data.symbol === symbol)
        : allData;
      
      return filteredData.slice(0, limit);
    } catch (error) {
      console.error('Error getting market data:', error);
      throw new Error('Failed to retrieve market data');
    }
  }

  async getLatestMarketData(symbol: string): Promise<MarketData | null> {
    try {
      const data = await this.getMarketData(symbol, 1);
      return data.length > 0 ? data[0] : null;
    } catch (error) {
      console.error('Error getting latest market data:', error);
      return null;
    }
  }

  // Trade Methods
  async saveTrade(trade: Omit<Trade, 'id'>): Promise<Trade> {
    try {
      const newTrade: Trade = {
        ...trade,
        id: this.generateId(),
      };

      const existingTrades = this.getStoredData<Trade[]>(this.TRADES_KEY) || [];
      const updatedTrades = [newTrade, ...existingTrades];
      
      this.setStoredData(this.TRADES_KEY, updatedTrades);
      
      // Update portfolio after trade
      await this.updatePortfolioAfterTrade(newTrade);
      
      return newTrade;
    } catch (error) {
      console.error('Error saving trade:', error);
      throw new Error('Failed to save trade');
    }
  }

  async getTrades(symbol?: string, limit: number = 100): Promise<Trade[]> {
    try {
      const allTrades = this.getStoredData<Trade[]>(this.TRADES_KEY) || [];
      
      let filteredTrades = symbol 
        ? allTrades.filter(trade => trade.symbol === symbol)
        : allTrades;
      
      return filteredTrades.slice(0, limit);
    } catch (error) {
      console.error('Error getting trades:', error);
      throw new Error('Failed to retrieve trades');
    }
  }

  async updateTradeStatus(tradeId: string, status: Trade['status']): Promise<Trade | null> {
    try {
      const trades = this.getStoredData<Trade[]>(this.TRADES_KEY) || [];
      const tradeIndex = trades.findIndex(trade => trade.id === tradeId);
      
      if (tradeIndex === -1) {
        return null;
      }
      
      trades[tradeIndex].status = status;
      this.setStoredData(this.TRADES_KEY, trades);
      
      return trades[tradeIndex];
    } catch (error) {
      console.error('Error updating trade status:', error);
      throw new Error('Failed to update trade status');
    }
  }

  // Portfolio Methods
  async getPortfolio(): Promise<Portfolio[]> {
    try {
      return this.getStoredData<Portfolio[]>(this.PORTFOLIO_KEY) || [];
    } catch (error) {
      console.error('Error getting portfolio:', error);
      throw new Error('Failed to retrieve portfolio');
    }
  }

  async getPortfolioPosition(symbol: string): Promise<Portfolio | null> {
    try {
      const portfolio = await this.getPortfolio();
      return portfolio.find(position => position.symbol === symbol) || null;
    } catch (error) {
      console.error('Error getting portfolio position:', error);
      return null;
    }
  }

  private async updatePortfolioAfterTrade(trade: Trade): Promise<void> {
    if (trade.status !== 'completed') {
      return;
    }

    try {
      const portfolio = await this.getPortfolio();
      const existingPositionIndex = portfolio.findIndex(pos => pos.symbol === trade.symbol);
      
      if (existingPositionIndex >= 0) {
        const position = portfolio[existingPositionIndex];
        
        if (trade.type === 'buy') {
          const totalValue = (position.quantity * position.averagePrice) + (trade.quantity * trade.price);
          const totalQuantity = position.quantity + trade.quantity;
          
          position.quantity = totalQuantity;
          position.averagePrice = totalValue / totalQuantity;
        } else {
          position.quantity = Math.max(0, position.quantity - trade.quantity);
        }
        
        // Remove position if quantity is 0
        if (position.quantity === 0) {
          portfolio.splice(existingPositionIndex, 1);
        } else {
          // Update current value and returns (would need current market price)
          const latestData = await this.getLatestMarketData(trade.symbol);
          if (latestData) {
            position.currentValue = position.quantity * latestData.price;
            const totalCost = position.quantity * position.averagePrice;
            position.totalReturn = position.currentValue - totalCost;
            position.returnPercent = (position.totalReturn / totalCost) * 100;
          }
        }
      } else if (trade.type === 'buy') {
        // Create new position
        const newPosition: Portfolio = {
          id: this.generateId(),
          symbol: trade.symbol,
          quantity: trade.quantity,
          averagePrice: trade.price,
          currentValue: trade.quantity * trade.price,
          totalReturn: 0,
          returnPercent: 0,
        };
        
        portfolio.push(newPosition);
      }
      
      this.setStoredData(this.PORTFOLIO_KEY, portfolio);
    } catch (error) {
      console.error('Error updating portfolio:', error);
    }
  }

  // Analytics Methods
  async getTradingAnalytics(): Promise<{
    totalTrades: number;
    totalVolume: number;
    profitLoss: number;
    winRate: number;
    portfolioValue: number;
  }> {
    try {
      const trades = await this.getTrades();
      const portfolio = await this.getPortfolio();
      
      const completedTrades = trades.filter(trade => trade.status === 'completed');
      const totalVolume = completedTrades.reduce((sum, trade) => sum + (trade.quantity * trade.price), 0);
      
      const portfolioValue = portfolio.reduce((sum, position) => sum + position.currentValue, 0);
      const totalReturn = portfolio.reduce((sum, position) => sum + position.totalReturn, 0);
      
      // Calculate win rate (simplified)
      const profitableTrades = portfolio.filter(position => position.totalReturn > 0).length;
      const winRate = portfolio.length > 0 ? (profitableTrades / portfolio.length) * 100 : 0;
      
      return {
        totalTrades: completedTrades.length,
        totalVolume,
        profitLoss: totalReturn,
        winRate,
        portfolioValue,
      };
    } catch (error) {
      console.error('Error getting trading analytics:', error);
      throw new Error('Failed to retrieve trading analytics');
    }
  }

  // Utility Methods
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private getStoredData<T>(key: string): T | null {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`Error reading from localStorage key ${key}:`, error);
      return null;
    }
  }

  private setStoredData<T>(key: string, data: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error(`Error writing to localStorage key ${key}:`, error);
      throw new Error('Failed to save data to local storage');
    }
  }

  // Clear all data (useful for testing/reset)
  async clearAllData(): Promise<void> {
    try {
      localStorage.removeItem(this.MARKET_DATA_KEY);
      localStorage.removeItem(this.TRADES_KEY);
      localStorage.removeItem(this.PORTFOLIO_KEY);
    } catch (error) {
      console.error('Error clearing data:', error);
      throw new Error('Failed to clear data');
    }
  }
}

// Export singleton instance
export const localTradingService = new LocalTradingService();