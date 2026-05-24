export interface Holding {
  rank: number
  ticker: string
  name: string
  conviction: 0 | 1 | 2 | 3 | 4 | 5
  basket: string
  last_action: string | null
  action_date: string | null
  initial_weight: number | null
  current_weight: number
  position_detail: string | null
  summary: string
  bullets: string[]
}

export interface GraddoxSignal {
  trigger: string
  trade: string
  exp: string
  logic: string
  verdict: 'green' | 'yellow' | 'red' | 'gray'
}

export interface GraddoxLogEntry {
  time: string
  content: string
}

export interface GraddoxData {
  date: string
  last_updated: string
  bias: string
  bias_note: string
  spx_price: number | null
  qqq_price: number | null
  spx: {
    resistance: number
    gex1: number
    put_support: number
    key_target: number
    downside_risk: number
  }
  qqq: {
    resistance: number
    gex1: number
    put_support: number
    note?: string
  }
  signals: GraddoxSignal[]
  log: GraddoxLogEntry[]
}

export interface Profile {
  id: string
  user_id: string
  display_name: string | null
  avatar_url: string | null
  subscription_tier: 'free' | 'premium'
}

export interface TierConfig {
  color: string
  bg: string
  border: string
  label: string
  short: string
}
