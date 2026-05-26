export type UserStatus = 'pending' | 'approved' | 'rejected';
export type SubscriptionTier = 'free' | 'basic' | 'premium';

export interface Profile {
  user_id: string;
  email: string | null;
  display_name: string | null;
  subscription_tier: SubscriptionTier;
  status: UserStatus;
  created_at: string;
}

export interface Tier {
  id: SubscriptionTier;
  label: string;
  modules: string[];
}
