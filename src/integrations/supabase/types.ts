export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      market_data: {
        Row: {
          ask_volume: number | null
          bid_volume: number | null
          change_24h: number
          created_at: string
          id: string
          price: number
          spread: number | null
          symbol: string
          timestamp: string
          user_id: string | null
          volume: number
        }
        Insert: {
          ask_volume?: number | null
          bid_volume?: number | null
          change_24h: number
          created_at?: string
          id?: string
          price: number
          spread?: number | null
          symbol: string
          timestamp?: string
          user_id?: string | null
          volume: number
        }
        Update: {
          ask_volume?: number | null
          bid_volume?: number | null
          change_24h?: number
          created_at?: string
          id?: string
          price?: number
          spread?: number | null
          symbol?: string
          timestamp?: string
          user_id?: string | null
          volume?: number
        }
        Relationships: []
      }
      market_features: {
        Row: {
          correlation: number
          created_at: string
          id: string
          liquidity: number
          mean_reversion: number
          momentum: number
          ofi: number
          regime_confidence: number
          regime_type: string
          symbol: string
          timestamp: string
          trend: number
          user_id: string | null
          volatility: number
          vpin: number
          vvix: number
        }
        Insert: {
          correlation: number
          created_at?: string
          id?: string
          liquidity: number
          mean_reversion: number
          momentum: number
          ofi: number
          regime_confidence: number
          regime_type: string
          symbol: string
          timestamp?: string
          trend: number
          user_id?: string | null
          volatility: number
          vpin: number
          vvix: number
        }
        Update: {
          correlation?: number
          created_at?: string
          id?: string
          liquidity?: number
          mean_reversion?: number
          momentum?: number
          ofi?: number
          regime_confidence?: number
          regime_type?: string
          symbol?: string
          timestamp?: string
          trend?: number
          user_id?: string | null
          volatility?: number
          vpin?: number
          vvix?: number
        }
        Relationships: []
      }
      strategy_performance: {
        Row: {
          alpha: number
          beta: number
          created_at: string
          id: string
          last_updated: string
          performance_history: Json
          strategy_id: string
          strategy_name: string
          total_pnl: number
          trials: number
          user_id: string | null
          win_rate: number
          wins: number
        }
        Insert: {
          alpha?: number
          beta?: number
          created_at?: string
          id?: string
          last_updated?: string
          performance_history?: Json
          strategy_id: string
          strategy_name: string
          total_pnl?: number
          trials?: number
          user_id?: string | null
          win_rate?: number
          wins?: number
        }
        Update: {
          alpha?: number
          beta?: number
          created_at?: string
          id?: string
          last_updated?: string
          performance_history?: Json
          strategy_id?: string
          strategy_name?: string
          total_pnl?: number
          trials?: number
          user_id?: string | null
          win_rate?: number
          wins?: number
        }
        Relationships: []
      }
      trading_positions: {
        Row: {
          atr_value: number | null
          created_at: string
          current_price: number
          edge_decay_score: number | null
          entry_price: number
          entry_time: string
          exit_price: number | null
          exit_reason: string | null
          exit_time: string | null
          id: string
          max_drawdown_from_peak: number | null
          original_signal_id: string | null
          peak_pnl: number | null
          position_id: string
          profit_lock_method: string
          realized_pnl: number | null
          side: string
          size: number
          status: string
          symbol: string
          take_profit_price: number | null
          time_held_minutes: number
          trailing_stop_price: number | null
          unrealized_pnl: number
          unrealized_pnl_pct: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          atr_value?: number | null
          created_at?: string
          current_price: number
          edge_decay_score?: number | null
          entry_price: number
          entry_time: string
          exit_price?: number | null
          exit_reason?: string | null
          exit_time?: string | null
          id?: string
          max_drawdown_from_peak?: number | null
          original_signal_id?: string | null
          peak_pnl?: number | null
          position_id: string
          profit_lock_method: string
          realized_pnl?: number | null
          side: string
          size: number
          status?: string
          symbol: string
          take_profit_price?: number | null
          time_held_minutes?: number
          trailing_stop_price?: number | null
          unrealized_pnl?: number
          unrealized_pnl_pct?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          atr_value?: number | null
          created_at?: string
          current_price?: number
          edge_decay_score?: number | null
          entry_price?: number
          entry_time?: string
          exit_price?: number | null
          exit_reason?: string | null
          exit_time?: string | null
          id?: string
          max_drawdown_from_peak?: number | null
          original_signal_id?: string | null
          peak_pnl?: number | null
          position_id?: string
          profit_lock_method?: string
          realized_pnl?: number | null
          side?: string
          size?: number
          status?: string
          symbol?: string
          take_profit_price?: number | null
          time_held_minutes?: number
          trailing_stop_price?: number | null
          unrealized_pnl?: number
          unrealized_pnl_pct?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trading_positions_original_signal_id_fkey"
            columns: ["original_signal_id"]
            isOneToOne: false
            referencedRelation: "trading_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      trading_sessions: {
        Row: {
          configuration: Json
          created_at: string
          end_time: string | null
          final_equity: number | null
          id: string
          initial_equity: number
          max_drawdown: number | null
          session_name: string | null
          sharpe_ratio: number | null
          start_time: string
          status: string
          total_pnl: number
          total_trades: number
          updated_at: string
          user_id: string | null
          winning_trades: number
        }
        Insert: {
          configuration?: Json
          created_at?: string
          end_time?: string | null
          final_equity?: number | null
          id?: string
          initial_equity: number
          max_drawdown?: number | null
          session_name?: string | null
          sharpe_ratio?: number | null
          start_time?: string
          status?: string
          total_pnl?: number
          total_trades?: number
          updated_at?: string
          user_id?: string | null
          winning_trades?: number
        }
        Update: {
          configuration?: Json
          created_at?: string
          end_time?: string | null
          final_equity?: number | null
          id?: string
          initial_equity?: number
          max_drawdown?: number | null
          session_name?: string | null
          sharpe_ratio?: number | null
          start_time?: string
          status?: string
          total_pnl?: number
          total_trades?: number
          updated_at?: string
          user_id?: string | null
          winning_trades?: number
        }
        Relationships: []
      }
      trading_signals: {
        Row: {
          action: string
          confidence: number
          created_at: string
          features: Json
          id: string
          market_regime: Json
          price: number
          reasoning: string | null
          strategy: string
          symbol: string
          timestamp: string
          user_id: string | null
        }
        Insert: {
          action: string
          confidence: number
          created_at?: string
          features: Json
          id?: string
          market_regime: Json
          price: number
          reasoning?: string | null
          strategy: string
          symbol: string
          timestamp?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          confidence?: number
          created_at?: string
          features?: Json
          id?: string
          market_regime?: Json
          price?: number
          reasoning?: string | null
          strategy?: string
          symbol?: string
          timestamp?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
