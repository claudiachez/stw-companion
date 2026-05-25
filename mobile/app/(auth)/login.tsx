import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import Svg, { Path, Rect, Polygon } from 'react-native-svg'
import { supabase } from '@/lib/supabase'
import { COLORS } from '@/lib/theme'

WebBrowser.maybeCompleteAuthSession()

function STWLogo({ size = 80 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x="38" y="10" width="24" height="42" rx="12" fill="#22c55e" />
      <Path d="M25 52 Q25 75 50 75 Q75 75 75 52" stroke="#22c55e" strokeWidth="5" fill="none" />
      <Rect x="46" y="75" width="8" height="15" fill="#22c55e" />
      <Rect x="35" y="88" width="30" height="5" rx="2" fill="#22c55e" />
      <Polygon points="60,30 80,15 80,45" fill="#0a0a0a" opacity="0.9" />
      <Rect x="50" y="27" width="30" height="6" fill="#0a0a0a" opacity="0.9" />
    </Svg>
  )
}

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleEmailLogin() {
    if (!email || !password) {
      setError('Please enter your email and password.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (signInError) {
        setError(signInError.message)
      }
    } catch {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true)
    setError(null)
    try {
      if (Platform.OS === 'web') {
        // Full-page redirect: Google → back to origin → Supabase detects code in URL
        const origin = typeof window !== 'undefined' ? window.location.origin : ''
        const { error: oauthError } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: origin },
        })
        if (oauthError) {
          setError(oauthError.message)
          setGoogleLoading(false)
        }
        // On success the page navigates away — no cleanup needed
      } else {
        // Native: in-app browser with deep link callback
        const redirectUrl = Linking.createURL('auth/callback')
        const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
            skipBrowserRedirect: true,
          },
        })

        if (oauthError || !data?.url) {
          setError(oauthError?.message ?? 'Could not start Google sign-in.')
          setGoogleLoading(false)
          return
        }

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl)

        if (result.type === 'success' && result.url) {
          const parsedUrl = Linking.parse(result.url)
          const code = parsedUrl.queryParams?.['code'] as string | undefined
          if (code) {
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
            if (exchangeError) setError(exchangeError.message)
          } else {
            setError('Authentication failed. Please try again.')
          }
        }
        setGoogleLoading(false)
      }
    } catch {
      setError('An unexpected error occurred. Please try again.')
      setGoogleLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoWrap}>
          <STWLogo size={80} />
        </View>

        <Text style={styles.title}>STW COMPANION</Text>
        <Text style={styles.tagline}>AHEAD OF THE HERD</Text>

        <View style={styles.form}>
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={COLORS.t3}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading && !googleLoading}
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={COLORS.t3}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading && !googleLoading}
          />

          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, (loading || googleLoading) && styles.btnDisabled]}
            onPress={handleEmailLogin}
            disabled={loading || googleLoading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.acc} size="small" />
            ) : (
              <Text style={styles.btnPrimaryText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={[styles.btn, styles.btnGoogle, (loading || googleLoading) && styles.btnDisabled]}
            onPress={handleGoogleLogin}
            disabled={loading || googleLoading}
            activeOpacity={0.8}
          >
            {googleLoading ? (
              <ActivityIndicator color={COLORS.text} size="small" />
            ) : (
              <>
                <Text style={styles.googleIcon}>G</Text>
                <Text style={styles.btnGoogleText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>Stock Talk Weekly · Subscriber Access</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
    backgroundColor: COLORS.bg,
  },
  logoWrap: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 2,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  tagline: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 3,
    color: COLORS.acc,
    textAlign: 'center',
    marginBottom: 40,
  },
  form: {
    width: '100%',
    maxWidth: 360,
  },
  errorBox: {
    backgroundColor: '#1f0d0d',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    textAlign: 'center',
  },
  input: {
    backgroundColor: COLORS.s2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: COLORS.text,
    fontSize: 15,
    marginBottom: 12,
  },
  btn: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnPrimary: {
    backgroundColor: '#0d1f0f',
    borderWidth: 1,
    borderColor: COLORS.acc,
    marginBottom: 16,
  },
  btnPrimaryText: {
    color: COLORS.acc,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  btnGoogle: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnGoogleText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
  googleIcon: {
    color: '#4285F4',
    fontSize: 16,
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    color: COLORS.t3,
    fontSize: 12,
  },
  footer: {
    marginTop: 48,
    color: COLORS.t3,
    fontSize: 11,
    textAlign: 'center',
  },
})
