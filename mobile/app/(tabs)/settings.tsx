import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { COLORS } from '@/lib/theme'

interface BrokerRowProps {
  name: string
  description: string
  comingSoon?: boolean
}

function BrokerRow({ name, description, comingSoon = false }: BrokerRowProps) {
  return (
    <TouchableOpacity
      style={[styles.brokerRow, comingSoon && styles.brokerRowDisabled]}
      disabled={comingSoon}
      activeOpacity={comingSoon ? 1 : 0.7}
    >
      <View style={styles.brokerIcon}>
        <Ionicons name="link-outline" size={20} color={comingSoon ? COLORS.t3 : COLORS.t2} />
      </View>
      <View style={styles.brokerInfo}>
        <Text style={[styles.brokerName, comingSoon && styles.brokerNameDisabled]}>{name}</Text>
        <Text style={styles.brokerDesc}>{description}</Text>
      </View>
      {comingSoon ? (
        <View style={styles.comingSoonBadge}>
          <Text style={styles.comingSoonText}>Phase 4</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={16} color={COLORS.t3} />
      )}
    </TouchableOpacity>
  )
}

interface SectionHeaderProps {
  title: string
}

function SectionHeader({ title }: SectionHeaderProps) {
  return (
    <Text style={styles.sectionHeader}>{title}</Text>
  )
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>SETTINGS</Text>
        </View>

        {/* Broker Connect */}
        <SectionHeader title="Connect Broker" />
        <View style={styles.card}>
          <BrokerRow
            name="Alpaca"
            description="Commission-free trading via OAuth"
            comingSoon
          />
          <View style={styles.divider} />
          <BrokerRow
            name="Webull"
            description="Commission-free trading platform"
            comingSoon
          />
        </View>

        <View style={styles.phaseNote}>
          <Ionicons name="information-circle-outline" size={14} color={COLORS.t3} />
          <Text style={styles.phaseNoteText}>
            Broker integration launches in Phase 4. Auto-execute trades from STW signals.
          </Text>
        </View>

        {/* About */}
        <SectionHeader title="About" />
        <View style={styles.card}>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>App</Text>
            <Text style={styles.aboutValue}>STW Companion</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Version</Text>
            <Text style={styles.aboutValue}>1.0.0 · Phase 1 MVP</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>By</Text>
            <Text style={styles.aboutValue}>Stock Talk Weekly</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Tagline</Text>
            <Text style={[styles.aboutValue, { color: COLORS.acc }]}>Ahead of the Herd</Text>
          </View>
        </View>

        {/* Roadmap */}
        <SectionHeader title="Roadmap" />
        <View style={styles.card}>
          {[
            { phase: 'Phase 1', label: 'Picks, Signals, Profile', done: true },
            { phase: 'Phase 2', label: 'Live price alerts & notifications', done: false },
            { phase: 'Phase 3', label: 'Watchlist & custom alerts', done: false },
            { phase: 'Phase 4', label: 'Broker connect & auto-execute', done: false },
          ].map((item, i, arr) => (
            <View key={item.phase}>
              <View style={styles.roadmapRow}>
                <Ionicons
                  name={item.done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={18}
                  color={item.done ? COLORS.acc : COLORS.t3}
                />
                <View style={styles.roadmapInfo}>
                  <Text style={[styles.roadmapPhase, item.done && { color: COLORS.acc }]}>
                    {item.phase}
                  </Text>
                  <Text style={styles.roadmapLabel}>{item.label}</Text>
                </View>
              </View>
              {i < arr.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
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
  sectionHeader: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: COLORS.t3,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  card: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  brokerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  brokerRowDisabled: {
    opacity: 0.6,
  },
  brokerIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: COLORS.s2,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brokerInfo: {
    flex: 1,
    gap: 2,
  },
  brokerName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  brokerNameDisabled: {
    color: COLORS.t2,
  },
  brokerDesc: {
    fontSize: 12,
    color: COLORS.t3,
  },
  comingSoonBadge: {
    backgroundColor: COLORS.s2,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  comingSoonText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.t3,
  },
  phaseNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 8,
  },
  phaseNoteText: {
    flex: 1,
    fontSize: 11,
    color: COLORS.t3,
    lineHeight: 16,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.bsub,
    marginLeft: 14,
  },
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  aboutLabel: {
    fontSize: 14,
    color: COLORS.t2,
    fontWeight: '500',
  },
  aboutValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  roadmapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  roadmapInfo: {
    flex: 1,
    gap: 2,
  },
  roadmapPhase: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.t2,
  },
  roadmapLabel: {
    fontSize: 12,
    color: COLORS.t3,
  },
})
