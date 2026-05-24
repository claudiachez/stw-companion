import { useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  SectionList,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { fetchHoldings } from '@/lib/supabase'
import { FALLBACK_HOLDINGS } from '@/lib/fallback'
import { COLORS, TIERS } from '@/lib/theme'
import { Holding } from '@/lib/types'
import HoldingRow from '@/components/HoldingRow'

type SortMode = 'conviction' | 'alpha' | 'recent' | 'weight'
type ConvictionFilter = 'all' | 0 | 1 | 2 | 3 | 4 | 5

const CONVICTION_FILTERS: { label: string; value: ConvictionFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'T5', value: 5 },
  { label: 'T4', value: 4 },
  { label: 'T3', value: 3 },
  { label: 'T2', value: 2 },
  { label: 'T1', value: 1 },
  { label: 'T0', value: 0 },
]

const SORT_MODES: { label: string; value: SortMode }[] = [
  { label: 'Conviction', value: 'conviction' },
  { label: 'A→Z', value: 'alpha' },
  { label: 'Recent', value: 'recent' },
  { label: 'Weight', value: 'weight' },
]

interface Section {
  title: string
  conviction: number
  data: Holding[]
}

export default function PicksScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [search, setSearch] = useState('')
  const [basketFilter, setBasketFilter] = useState<string>('All')
  const [convFilter, setConvFilter] = useState<ConvictionFilter>('all')
  const [sortMode, setSortMode] = useState<SortMode>('conviction')
  const [refreshing, setRefreshing] = useState(false)

  const { data: holdings, error, isLoading, refetch } = useQuery({
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

  const displayData = holdings ?? FALLBACK_HOLDINGS

  const baskets = useMemo(() => {
    const all = displayData.map((h) => h.basket)
    return ['All', ...Array.from(new Set(all)).sort()]
  }, [displayData])

  const filtered = useMemo(() => {
    let list = [...displayData]

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (h) =>
          h.ticker.toLowerCase().includes(q) ||
          h.name.toLowerCase().includes(q) ||
          h.basket.toLowerCase().includes(q)
      )
    }

    if (basketFilter !== 'All') {
      list = list.filter((h) => h.basket === basketFilter)
    }

    if (convFilter !== 'all') {
      list = list.filter((h) => h.conviction === convFilter)
    }

    switch (sortMode) {
      case 'conviction':
        list.sort((a, b) => b.conviction - a.conviction || a.rank - b.rank)
        break
      case 'alpha':
        list.sort((a, b) => a.ticker.localeCompare(b.ticker))
        break
      case 'recent':
        list.sort((a, b) => {
          const da = a.action_date ?? ''
          const db = b.action_date ?? ''
          return db.localeCompare(da)
        })
        break
      case 'weight':
        list.sort((a, b) => b.current_weight - a.current_weight)
        break
    }

    return list
  }, [displayData, search, basketFilter, convFilter, sortMode])

  const sections = useMemo((): Section[] => {
    if (sortMode !== 'conviction') return []

    const tierMap = new Map<number, Holding[]>()
    for (const h of filtered) {
      const existing = tierMap.get(h.conviction) ?? []
      existing.push(h)
      tierMap.set(h.conviction, existing)
    }

    const tiers = [5, 4, 3, 2, 1, 0]
    return tiers
      .filter((t) => tierMap.has(t))
      .map((t) => ({
        title: TIERS[t]?.label ?? `Tier ${t}`,
        conviction: t,
        data: tierMap.get(t) ?? [],
      }))
  }, [filtered, sortMode])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }, [refetch])

  if (isLoading && !holdings) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.acc} size="large" />
        <Text style={styles.loadingText}>Loading picks…</Text>
      </View>
    )
  }

  const ListHeader = (
    <View>
      {/* Screen Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>STW PICKS</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{filtered.length}</Text>
        </View>
        {error ? <Text style={styles.errorHint}>Using cached data</Text> : null}
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search ticker, name, basket…"
          placeholderTextColor={COLORS.t3}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Basket filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipContent}
      >
        {baskets.map((b) => (
          <TouchableOpacity
            key={b}
            onPress={() => setBasketFilter(b)}
            style={[styles.chip, basketFilter === b && styles.chipActive]}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, basketFilter === b && styles.chipTextActive]}>
              {b}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Conviction filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipContent}
      >
        {CONVICTION_FILTERS.map((f) => {
          const isActive = convFilter === f.value
          const tierColor = f.value !== 'all' ? TIERS[f.value]?.color : COLORS.acc
          return (
            <TouchableOpacity
              key={String(f.value)}
              onPress={() => setConvFilter(f.value)}
              style={[
                styles.chip,
                isActive && { borderColor: tierColor, backgroundColor: COLORS.s2 },
              ]}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, isActive && { color: tierColor }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* Sort buttons */}
      <View style={styles.sortRow}>
        {SORT_MODES.map((s) => (
          <TouchableOpacity
            key={s.value}
            onPress={() => setSortMode(s.value)}
            style={[styles.sortBtn, sortMode === s.value && styles.sortBtnActive]}
            activeOpacity={0.7}
          >
            <Text style={[styles.sortText, sortMode === s.value && styles.sortTextActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={COLORS.acc}
    />
  )

  if (sortMode === 'conviction') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.ticker}
          renderSectionHeader={({ section }) => {
            const tier = TIERS[section.conviction] ?? TIERS[0]
            return (
              <View style={[styles.tierHead, { borderBottomColor: tier.border, backgroundColor: tier.bg }]}>
                <Text style={[styles.tierHeadText, { color: tier.color }]}>
                  {section.title}
                </Text>
                <Text style={[styles.tierHeadCount, { color: tier.color }]}>
                  {section.data.length}
                </Text>
              </View>
            )
          }}
          renderItem={({ item }) => (
            <HoldingRow
              holding={item}
              onPress={() => router.push(`/pick/${item.ticker}`)}
            />
          )}
          ListHeaderComponent={ListHeader}
          refreshControl={refreshControl}
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingBottom: insets.bottom + 8 }}
        />
      </View>
    )
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.ticker}
        renderItem={({ item }) => (
          <HoldingRow
            holding={item}
            onPress={() => router.push(`/pick/${item.ticker}`)}
          />
        )}
        ListHeaderComponent={ListHeader}
        refreshControl={refreshControl}
        contentContainerStyle={{ paddingBottom: insets.bottom + 8 }}
      />
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
    gap: 12,
  },
  loadingText: {
    color: COLORS.t2,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
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
  countBadge: {
    backgroundColor: COLORS.s2,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  countText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.t2,
  },
  errorHint: {
    fontSize: 10,
    color: COLORS.t3,
    marginLeft: 'auto',
  },
  searchWrap: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bsub,
  },
  searchInput: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: COLORS.text,
    fontSize: 14,
  },
  chipScroll: {
    backgroundColor: COLORS.surface,
  },
  chipContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'transparent',
  },
  chipActive: {
    backgroundColor: '#0d2618',
    borderColor: COLORS.acc,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.t2,
  },
  chipTextActive: {
    color: COLORS.acc,
  },
  sortRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sortBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sortBtnActive: {
    backgroundColor: '#0d2618',
    borderColor: COLORS.acc,
  },
  sortText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.t2,
  },
  sortTextActive: {
    color: COLORS.acc,
  },
  tierHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderBottomWidth: 1,
  },
  tierHeadText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  tierHeadCount: {
    fontSize: 10,
    fontWeight: '500',
    opacity: 0.6,
  },
})
