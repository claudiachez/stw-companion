import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Holding } from '@/lib/types'
import { TIERS, COLORS } from '@/lib/theme'
import { FinnhubQuote } from '@/lib/finnhub'

interface HoldingRowProps {
  holding: Holding
  onPress: () => void
  selected?: boolean
  price?: FinnhubQuote | null
}

export default function HoldingRow({ holding, onPress, selected = false, price }: HoldingRowProps) {
  const tier = TIERS[holding.conviction] ?? TIERS[0]

  const snippet = holding.summary.length > 70
    ? holding.summary.slice(0, 70) + '…'
    : holding.summary

  const dateStr = holding.action_date
    ? holding.action_date.slice(0, 10)
    : null

  const weightStr = holding.current_weight < 0
    ? `${holding.current_weight.toFixed(1)}%`
    : `${holding.current_weight.toFixed(1)}%`

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        selected && styles.rowSelected,
        pressed && styles.rowPressed,
      ]}
    >
      <Text style={styles.rank}>{String(holding.rank).padStart(2, '0')}</Text>

      <View style={[styles.bar, { backgroundColor: tier.color }]} />

      <View style={styles.main}>
        <Text style={[styles.ticker, selected && { color: tier.color }]}>
          {holding.ticker}
        </Text>
        <View style={styles.infoRow}>
          <View style={[styles.basketChip, { backgroundColor: COLORS.s2, borderColor: COLORS.border }]}>
            <Text style={styles.basketText}>{holding.basket}</Text>
          </View>
          <Text style={styles.snippet} numberOfLines={1}>{snippet}</Text>
        </View>
      </View>

      <View style={styles.right}>
        <View style={styles.weightRow}>
          <Text style={styles.weight}>{weightStr}</Text>
        </View>

        {price ? (
          <View style={styles.priceRow}>
            <Text style={styles.priceNum}>${price.c.toFixed(2)}</Text>
            <Text style={[styles.priceChg, price.dp >= 0 ? styles.priceUp : styles.priceDn]}>
              {price.dp >= 0 ? '+' : ''}{price.dp.toFixed(2)}%
            </Text>
          </View>
        ) : dateStr ? (
          <Text style={styles.date}>{dateStr.slice(5)}</Text>
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bsub,
    backgroundColor: COLORS.bg,
  },
  rowSelected: {
    backgroundColor: '#0d2618',
  },
  rowPressed: {
    backgroundColor: COLORS.s2,
  },
  rank: {
    fontSize: 10,
    color: COLORS.t3,
    minWidth: 18,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  bar: {
    width: 3,
    height: 32,
    borderRadius: 2,
    flexShrink: 0,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  ticker: {
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.3,
    color: COLORS.text,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
    flexWrap: 'nowrap',
  },
  basketChip: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
    flexShrink: 0,
  },
  basketText: {
    fontSize: 9,
    color: COLORS.t2,
    fontWeight: '500',
  },
  snippet: {
    fontSize: 10,
    color: COLORS.t3,
    flex: 1,
  },
  right: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 3,
    flexShrink: 0,
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  weight: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.t2,
    fontVariant: ['tabular-nums'],
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  priceNum: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.text,
    fontVariant: ['tabular-nums'],
  },
  priceChg: {
    fontSize: 10,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  priceUp: {
    color: '#16A34A',
  },
  priceDn: {
    color: '#DC2626',
  },
  date: {
    fontSize: 10,
    color: COLORS.t3,
    fontVariant: ['tabular-nums'],
  },
})
