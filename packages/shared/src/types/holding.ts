export type ConvictionLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type BasketName =
  | 'Robotics & Edge AI'
  | 'Power Infrastructure'
  | 'Data Center'
  | 'Telecom & Voice AI'
  | 'Chips'
  | 'Defense'
  | 'Other';

export type ActionType = 'New' | 'Upsized' | 'Hold' | 'Trimmed' | 'Closed';

export interface Holding {
  rank: number;
  ticker: string;
  name: string;
  conviction: ConvictionLevel;
  basket: BasketName;
  last_action: ActionType | null;
  action_date: string | null;
  initial_weight: number | null;
  current_weight: number;
  position_detail: string | null;
  summary: string;
  bullets: string[];
  updated_at?: string;
}
