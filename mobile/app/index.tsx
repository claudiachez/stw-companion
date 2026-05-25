import { View, StyleSheet } from 'react-native'
import { COLORS } from '@/lib/theme'

// Root route required by expo-router. The root _layout.tsx handles
// auth-based redirect to /(auth)/login or /(tabs)/picks via useEffect.
export default function Index() {
  return <View style={styles.container} />
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
})
