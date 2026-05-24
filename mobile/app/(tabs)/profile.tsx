import { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '@/store/auth'
import { fetchProfile, upsertProfile, supabase } from '@/lib/supabase'
import { COLORS } from '@/lib/theme'
import { Profile } from '@/lib/types'

function InitialsAvatar({ name, email, size = 72 }: { name?: string | null; email?: string; size?: number }) {
  const initials = name
    ? name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : email
    ? email[0].toUpperCase()
    : '?'

  return (
    <View style={[styles.initialsCircle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.initialsText, { fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  )
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets()
  const { session } = useAuthStore()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const email = session?.user?.email ?? ''
  const userId = session?.user?.id ?? ''

  const loadProfile = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      let p = await fetchProfile(userId)
      if (!p) {
        p = await upsertProfile(userId, {
          display_name: null,
          avatar_url: null,
          subscription_tier: 'free',
        })
      }
      setProfile(p)
      setDisplayName(p.display_name ?? '')
    } catch {
      // silently fail — user still sees their email
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  async function handleSave() {
    if (!userId) return
    setSaving(true)
    try {
      const updated = await upsertProfile(userId, { display_name: displayName.trim() || null })
      setProfile(updated)
      setDisplayName(updated.display_name ?? '')
      Alert.alert('Saved', 'Display name updated.')
    } catch {
      Alert.alert('Error', 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true)
          await supabase.auth.signOut()
          setSigningOut(false)
        },
      },
    ])
  }

  const isPremium = profile?.subscription_tier === 'premium'
  const hasChanges = displayName !== (profile?.display_name ?? '')

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>PROFILE</Text>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={COLORS.acc} size="large" />
          </View>
        ) : (
          <>
            {/* Avatar + identity */}
            <View style={styles.avatarSection}>
              {profile?.avatar_url ? (
                <Image
                  source={{ uri: profile.avatar_url }}
                  style={styles.avatar}
                  contentFit="cover"
                />
              ) : (
                <InitialsAvatar name={profile?.display_name} email={email} size={72} />
              )}
              <View style={styles.identityInfo}>
                <Text style={styles.nameText}>
                  {profile?.display_name ?? email.split('@')[0] ?? 'User'}
                </Text>
                <Text style={styles.emailText}>{email}</Text>
                <View style={[
                  styles.tierBadge,
                  isPremium ? styles.tierBadgePremium : styles.tierBadgeFree,
                ]}>
                  <Text style={[
                    styles.tierBadgeText,
                    isPremium ? styles.tierBadgeTextPremium : styles.tierBadgeTextFree,
                  ]}>
                    {isPremium ? 'Premium' : 'Free'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Edit section */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Display Name</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Enter display name"
                placeholderTextColor={COLORS.t3}
                autoCorrect={false}
              />
              <Text style={styles.fieldHint}>
                Email: {email} (read-only)
              </Text>
            </View>

            {hasChanges && (
              <View style={styles.sectionPadded}>
                <TouchableOpacity
                  style={[styles.saveBtn, saving && styles.btnDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator color={COLORS.acc} size="small" />
                  ) : (
                    <Text style={styles.saveBtnText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Sign out */}
            <View style={styles.sectionPadded}>
              <TouchableOpacity
                style={[styles.signOutBtn, signingOut && styles.btnDisabled]}
                onPress={handleSignOut}
                disabled={signingOut}
                activeOpacity={0.8}
              >
                {signingOut ? (
                  <ActivityIndicator color="#ef4444" size="small" />
                ) : (
                  <Text style={styles.signOutBtnText}>Sign Out</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
    color: COLORS.text,
  },
  avatarSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  initialsCircle: {
    backgroundColor: '#0d1f0f',
    borderWidth: 2,
    borderColor: COLORS.acc,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    color: COLORS.acc,
    fontWeight: '700',
  },
  identityInfo: {
    flex: 1,
    gap: 4,
  },
  nameText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  emailText: {
    fontSize: 13,
    color: COLORS.t2,
  },
  tierBadge: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  tierBadgePremium: {
    backgroundColor: '#0d1f0f',
    borderColor: COLORS.acc,
  },
  tierBadgeFree: {
    backgroundColor: COLORS.s2,
    borderColor: COLORS.border,
  },
  tierBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  tierBadgeTextPremium: {
    color: COLORS.acc,
  },
  tierBadgeTextFree: {
    color: COLORS.t2,
  },
  section: {
    backgroundColor: COLORS.surface,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: COLORS.t3,
    marginBottom: 2,
  },
  input: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: COLORS.text,
    fontSize: 15,
  },
  fieldHint: {
    fontSize: 11,
    color: COLORS.t3,
  },
  sectionPadded: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  saveBtn: {
    backgroundColor: '#0d1f0f',
    borderWidth: 1,
    borderColor: COLORS.acc,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: COLORS.acc,
    fontSize: 15,
    fontWeight: '700',
  },
  signOutBtn: {
    backgroundColor: '#1f0d0d',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutBtnText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.5,
  },
})
