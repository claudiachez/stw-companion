import { useState, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { fetchGraddox } from '@/lib/supabase'
import { FALLBACK_GRADDOX } from '@/lib/fallback'
import { COLORS } from '@/lib/theme'
import { GraddoxData } from '@/lib/types'

function getBiasColor(bias: string): string {
  const b = bias.toLowerCase()
  if (b.includes('bull') || b === 'up') return '#22c55e'
  if (b.includes('bear') || b === 'down') return '#ef4444'
  if (b.includes('flat')) return '#f59e0b'
  return '#6b7280'
}

function getVerdictColor(verdict: string): string {
  switch (verdict) {
    case 'green':  return '#22c55e'
    case 'yellow': return '#f59e0b'
    case 'red':    return '#ef4444'
    default:       return '#6b7280'
  }
}

function LevelRow({ label, value, emoji }: { label: string; value: number; emoji: string }) {
  return (
    <View style={styles.levelRow}>
      <Text style={styles.levelEmoji}>{emoji}</Text>
      <Text style={styles.levelLabel}>{label}</Text>
      <Text style={styles.levelValue}>{value.toLocaleString()}</Text>
    </View>
  )
}

function LevelsTable({ title, levels }: { title: string; levels: { label: string; value: number; emoji: string }[] }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {levels.map((lvl, i) => (
        <LevelRow key={i} label={lvl.label} value={lvl.value} emoji={lvl.emoji} />
      ))}
    </View>
  )
}

function SignalsTable({ data }: { data: GraddoxData }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Signals</Text>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Trigger</Text>
        <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Trade</Text>
        <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Exp</Text>
        <Text style={[styles.tableHeaderCell, { width: 30, textAlign: 'center' }]}>V</Text>
      </View>
      {data.signals.map((sig, i) => (
        <View key={i} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
          <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={2}>{sig.trigger}</Text>
          <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={2}>{sig.trade}</Text>
          <Text style={[styles.tableCell, { flex: 1 }]}>{sig.exp}</Text>
          <View style={{ width: 30, alignItems: 'center' }}>
            <View
              style={[
                styles.verdictDot,
                { backgroundColor: getVerdictColor(sig.verdict) },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  )
}

function LogSection({ data }: { data: GraddoxData }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Log</Text>
      {data.log.map((entry, i) => (
        <View key={i} style={styles.logEntry}>
          <Text style={styles.logTime}>{entry.time}</Text>
          <Text style={styles.logContent}>{entry.content}</Text>
        </View>
      ))}
    </View>
  )
}

export default function SignalsScreen() {
  const insets = useSafeAreaInsets()
  const [refreshing, setRefreshing] = useState(false)

  const { data: graddox, error, isLoading, refetch } = useQuery({
    queryKey: ['graddox'],
    queryFn: async () => {
      try {
        return await fetchGraddox()
      } catch {
        return FALLBACK_GRADDOX
      }
    },
    staleTime: 5 * 60 * 1000,
  })

  const displayData = graddox ?? FALLBACK_GRADDOX

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }, [refetch])

  const spxLevels = [
    { label: 'Resistance',    value: displayData.spx.resistance,    emoji: '🔴' },
    { label: 'GEX1',          value: displayData.spx.gex1,          emoji: '🟡' },
    { label: 'Put Support',   value: displayData.spx.put_support,   emoji: '🟢' },
    { label: 'Key Target',    value: displayData.spx.key_target,    emoji: '🎯' },
    { label: 'Downside Risk', value: displayData.spx.downside_risk, emoji: '⚠️' },
  ].sort((a, b) => b.value - a.value)

  const qqqLevels = [
    { label: 'Resistance',  value: displayData.qqq.resistance,  emoji: '🔴' },
    { label: 'GEX1',        value: displayData.qqq.gex1,        emoji: '🟡' },
    { label: 'Put Support', value: displayData.qqq.put_support, emoji: '🟢' },
  ].sort((a, b) => b.value - a.value)

  const biasColor = getBiasColor(displayData.bias)

  if (isLoading && !graddox) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.acc} size="large" />
        <Text style={styles.loadingText}>Loading signals…</Text>
      </View>
    )
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.acc}
          />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>GRADDOX SIGNALS</Text>
            <Text style={styles.headerDate}>{displayData.date}</Text>
          </View>
          <View style={[styles.biasBadge, { borderColor: biasColor, backgroundColor: `${biasColor}15` }]}>
            <Text style={[styles.biasText, { color: biasColor }]}>{displayData.bias}</Text>
          </View>
          {error ? <Text style={styles.errorHint}>Cached</Text> : null}
        </View>

        {/* Bias note */}
        {displayData.bias_note ? (
          <View style={styles.biasNote}>
            <Text style={styles.biasNoteText}>{displayData.bias_note}</Text>
          </View>
        ) : null}

        <View style={styles.content}>
          {/* SPX Levels */}
          <LevelsTable title="SPX Levels" levels={spxLevels} />

          {/* QQQ Levels */}
          <View>
            <LevelsTable title="QQQ Levels" levels={qqqLevels} />
            {displayData.qqq.note ? (
              <Text style={styles.qqqNote}>* {displayData.qqq.note}</Text>
            ) : null}
          </View>

          {/* Signals */}
          <SignalsTable data={displayData} />

          {/* Log */}
          {displayData.log.length > 0 ? <LogSection data={displayData} /> : null}
        </View>
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
    paddingBottom: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexWrap: 'wrap',
  },
  headerLeft: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1,
    color: COLORS.text,
  },
  headerDate: {
    fontSize: 11,
    color: COLORS.t3,
  },
  biasBadge: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  biasText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'lowercase',
  },
  errorHint: {
    fontSize: 10,
    color: COLORS.t3,
  },
  biasNote: {
    backgroundColor: COLORS.s2,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bsub,
  },
  biasNoteText: {
    fontSize: 12,
    color: COLORS.t2,
    lineHeight: 18,
  },
  content: {
    padding: 12,
    gap: 12,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: COLORS.t2,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bsub,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bsub,
    gap: 10,
  },
  levelEmoji: {
    fontSize: 14,
    width: 20,
    textAlign: 'center',
  },
  levelLabel: {
    flex: 1,
    fontSize: 13,
    color: COLORS.t2,
    fontWeight: '500',
  },
  levelValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    fontVariant: ['tabular-nums'],
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: COLORS.s2,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tableHeaderCell: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: COLORS.t3,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bsub,
    gap: 4,
  },
  tableRowAlt: {
    backgroundColor: COLORS.s2,
  },
  tableCell: {
    fontSize: 12,
    color: COLORS.text,
    lineHeight: 16,
  },
  verdictDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  qqqNote: {
    fontSize: 11,
    color: COLORS.t3,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontStyle: 'italic',
  },
  logEntry: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bsub,
    gap: 4,
  },
  logTime: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.acc,
    fontVariant: ['tabular-nums'],
  },
  logContent: {
    fontSize: 13,
    color: COLORS.t2,
    lineHeight: 18,
  },
})
