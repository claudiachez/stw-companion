import { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { COLORS } from '@/lib/theme'

// STW Mic + Arrow SVG as inline component
import Svg, { Path, Rect, Polygon } from 'react-native-svg'

const queryClient = new QueryClient()

function STWLogo({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* Microphone body */}
      <Rect x="38" y="10" width="24" height="42" rx="12" fill="#22c55e" />
      {/* Microphone stand base */}
      <Path d="M25 52 Q25 75 50 75 Q75 75 75 52" stroke="#22c55e" strokeWidth="5" fill="none" />
      <Rect x="46" y="75" width="8" height="15" fill="#22c55e" />
      <Rect x="35" y="88" width="30" height="5" rx="2" fill="#22c55e" />
      {/* Arrow */}
      <Polygon points="60,30 80,15 80,45" fill="#0a0a0a" opacity="0.9" />
      <Rect x="50" y="27" width="30" height="6" fill="#0a0a0a" opacity="0.9" />
    </Svg>
  )
}

function LoadingScreen() {
  return (
    <View style={styles.loadingContainer}>
      <STWLogo size={80} />
    </View>
  )
}

function RootLayoutNav() {
  const { session, loading, initialize } = useAuthStore()
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    if (loading) return

    const inAuthGroup = segments[0] === '(auth)'

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login')
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)/picks')
    }
  }, [session, loading, segments, router])

  if (loading) {
    return <LoadingScreen />
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="pick/[ticker]"
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: COLORS.surface },
          headerTintColor: COLORS.text,
          headerBackTitle: 'Picks',
          presentation: 'card',
        }}
      />
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <RootLayoutNav />
    </QueryClientProvider>
  )
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
