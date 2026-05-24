import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { Holding, GraddoxData, Profile } from './types'

const SUPABASE_URL = 'https://usmqbohcjcyszjxxvnqu.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_aPliJhMtRvi3kUST45VeTA_4rIjNfrR'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
})

export async function fetchHoldings(): Promise<Holding[]> {
  const { data, error } = await supabase
    .from('holdings')
    .select('*')
    .order('rank', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    throw new Error('No holdings data returned')
  }

  return data as Holding[]
}

export async function fetchGraddox(): Promise<GraddoxData> {
  const { data, error } = await supabase
    .from('graddox')
    .select('*')
    .limit(1)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    throw new Error('No Graddox data returned')
  }

  return data as GraddoxData
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      // Row not found
      return null
    }
    throw new Error(error.message)
  }

  return data as Profile
}

export async function upsertProfile(
  userId: string,
  profileData: Partial<Omit<Profile, 'id' | 'user_id'>>
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      { user_id: userId, ...profileData },
      { onConflict: 'user_id' }
    )
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as Profile
}
