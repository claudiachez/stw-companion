import { useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { useLocalSearchParams, useNavigation } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { fetchHoldings } from '@/lib/supabase'
import { FALLBACK_HOLDINGS } from '@/lib/fallback'
import { fetchPrice } from '@/lib/finnhub'
import { COLORS, TIERS } from '@/lib/theme'
import { Holding } from '@/lib/types'
import TierBadge from '@/components/TierBadge'
import ConvictionMeter from '@/components/ConvictionMeter'

export default function PickDetailScreen() {
  const { ticker } = useLocalSearchParams<{ ticker: string }>()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()

  const { data: holdings } = useQuery({
    queryKey: ['holdings'],
    queryFn: async () => {
      try {
        return await fetchHoldings()
      } catch {
        return FALLBACK_HOLDINGS
      }
    },
    staleTime: 5 * 60 * 1000,
  })

  const allHoldings: Holding[] = holdings ?? FALLBACK_HOLDINGS
  const holding = allHoldings.find((h) => h.ticker === ticker)

  const { data: price, isLoading: priceLoading } = useQuery({
    queryKey: ['price', ticker],
    queryFn: () => fetchPrice(ticker ?? ''),
    refetchInterval: 30_000,
    enabled: !!ticker && ticker !== 'CASH',
  })

  const tier = TIERS[holding?.conviction ?? 0] ?? TIERS[0]

  useEffect(() => {
    if (holding) {
      navigation.setOptions({ title: holding.ticker })
    }
  }, [holding, navigation])

  if (!holding) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notFoundText}>Position not found: {ticker}</Text>
      </View>
    )
  }

  const totalHoldings = allHoldings.length
  const weightStr = holding.current_weight < 0
    ? `${holding.current_weight.toFixed(2)}%`
    : `${holding.current_weight.toFixed(2)}%`

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Hero header */}
        <View style={[styles.heroHeader, { backgroundColor: tier.bg, borderBottomColor: tier.border }]}>
          <View style={styles.heroLeft}>
            <Text style={[styles.heroTicker, { color: tier.color }]}>{holding.ticker}</Text>
            <Text style={styles.heroName} numberOfLines={2}>{holding.name}</Text>
          </View>
          {priceLoading ? (
            <ActivityIndicator color={tier.color} size="small" />
          ) : price ? (
            <View style={styles.priceBlock}>
              <Text style={styles.priceNum}>${price.c.toFixed(2)}</Text>
              <Text style={[styles.priceChg, price.dp >= 0 ? styles.priceUp : styles.priceDn]}>
                {price.dp >= 0 ? '+' : ''}{price.dp.toFixed(2)}%
              </Text>
              <Text style={styles.priceSub}>
                H: ${price.h.toFixed(2)} · L: ${price.l.toFixed(2)}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Badges row */}
        <View style={styles.badgesRow}>
          <TierBadge conviction={holding.conviction} />
          <View style={styles.basketBadge}>
            <Text style={styles.basketBadgeText}>{holding.basket}</Text>
          </View>
          <View style={styles.rankBadge}>
            <Text style={styles.rankBadgeText}>
              #{String(holding.rank).padStart(2, '0')} / {totalHoldings}
            </Text>
          </View>
        </View>

        {/* Conviction meter */}
        <View style={styles.meterSection}>
          <Text style={styles.meterLabel}>Conviction</Text>
          <ConvictionMeter conviction={holding.conviction} />
        </View>

        {/* Meta grid */}
        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Weight</Text>
            <Text style={styles.metaValue}>{weightStr}</Text>
          </View>
          {holding.initial_weight !== null && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Initial Weight</Text>
              <Text style={styles.metaValue}>{holding.initial_weight.toFixed(2)}%</Text>
            </View>
          )}
          {holding.last_action && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Last Action</Text>
              <Text style={styles.metaValue}>{holding.last_action}</Text>
            </View>
          )}
          {holding.action_date && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Action Date</Text>
              <Text style={styles.metaValue}>{holding.action_date}</Text>
            </View>
          )}
        </View>

        {/* Position detail */}
        {holding.position_detail && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Position</Text>
            <Text style={styles.positionDetail}>{holding.position_detail}</Text>
          </View>
        )}

        {/* Summary */}
        <View style={[styles.summaryBlock, { borderLeftColor: tier.color, backgroundColor: tier.bg }]}>
          <Text style={styles.sectionLabel}>Summary</Text>
          <Text style={styles.summaryText}>{holding.summary}</Text>
        </View>

        {/* Bullets */}
        {holding.bullets.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Key Points from Stream</Text>
            <View style={styles.bulletsList}>
              {holding.bullets.map((bullet, i) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bulletDot, { backgroundColor: tier.color }]} />
                  <Text style={styles.bulletText}>{bullet}</Text>
                </View>
              ))}
            </View>
          </View>
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
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  notFoundText: {
    color: COLORS.t2,
    fontSize: 15,
    textAlign: 'center',
  },
  content: {
    paddingBottom: 32,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  heroLeft: {
    flex: 1,
    gap: 4,
  },
  heroTicker: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 1,
    lineHeight: 36,
  },
  heroName: {
    fontSize: 13,
    color: COLORS.t2,
    lineHeight: 18,
    maxWidth: 200,
  },
  priceBlock: {
    alignItems: 'flex-end',
    gap: 2,
  },
  priceNum: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    fontVariant: ['tabular-nums'],
  },
  priceChg: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  priceUp: {
    color: '#16A34A',
  },
  priceDn: {
    color: '#DC2626',
  },
  priceSub: {
    fontSize: 10,
    color: COLORS.t3,
    fontVariant: ['tabular-nums'],
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bsub,
  },
  basketBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.s2,
    alignSelf: 'flex-start',
  },
  basketBadgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.t2,
  },
  rankBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.s2,
    alignSelf: 'flex-start',
  },
  rankBadgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.t2,
    fontVariant: ['tabular-nums'],
  },
  meterSection: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bsub,
    gap: 8,
  },
  meterLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: COLORS.t3,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bsub,
  },
  metaItem: {
    minWidth: '40%',
    gap: 3,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: COLORS.t3,
  },
  metaValue: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bsub,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: COLORS.t3,
  },
  positionDetail: {
    fontSize: 14,
    color: COLORS.t2,
    lineHeight: 20,
    fontFamily: 'monospace',
  },
  summaryBlock: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderLeftWidth: 3,
    borderRadius: 8,
    paddingLeft: 12,
    paddingRight: 14,
    paddingVertical: 12,
    gap: 8,
  },
  summaryText: {
    fontSize: 14,
    color: COLORS.t2,
    lineHeight: 21,
  },
  bulletsList: {
    gap: 10,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
    flexShrink: 0,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.t2,
    lineHeight: 20,
  },
})
