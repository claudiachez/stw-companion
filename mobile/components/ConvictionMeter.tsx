import { View, Text, StyleSheet } from 'react-native'
import { TIERS, COLORS } from '@/lib/theme'

interface ConvictionMeterProps {
  conviction: number
}

export default function ConvictionMeter({ conviction }: ConvictionMeterProps) {
  const tier = TIERS[conviction] ?? TIERS[0]

  return (
    <View style={styles.container}>
      <View style={styles.segments}>
        {[1, 2, 3, 4, 5].map((level) => (
          <View
            key={level}
            style={[
              styles.segment,
              {
                backgroundColor: level <= conviction ? tier.color : COLORS.border,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.labels}>
        <Text style={styles.labelLeft}>Concern</Text>
        <Text style={styles.labelRight}>Highest</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  segments: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
  },
  segment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  labelLeft: {
    fontSize: 10,
    color: COLORS.t3,
  },
  labelRight: {
    fontSize: 10,
    color: COLORS.t3,
  },
})
