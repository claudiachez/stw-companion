import { View, Text, StyleSheet } from 'react-native'
import { TIERS } from '@/lib/theme'

interface TierBadgeProps {
  conviction: number
  size?: 'sm' | 'md'
}

export default function TierBadge({ conviction, size = 'md' }: TierBadgeProps) {
  const tier = TIERS[conviction] ?? TIERS[0]

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: tier.bg,
          borderColor: tier.border,
        },
        size === 'sm' && styles.badgeSm,
      ]}
    >
      <Text
        style={[
          styles.text,
          { color: tier.color },
          size === 'sm' && styles.textSm,
        ]}
      >
        {size === 'sm' ? tier.short : tier.label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  badgeSm: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  textSm: {
    fontSize: 10,
  },
})
