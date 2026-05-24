import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { COLORS } from '@/lib/theme'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

interface TabConfig {
  name: string
  title: string
  icon: IoniconsName
  iconFocused: IoniconsName
}

const TABS: TabConfig[] = [
  { name: 'picks',    title: 'Picks',    icon: 'bar-chart-outline',    iconFocused: 'bar-chart' },
  { name: 'signals',  title: 'Signals',  icon: 'trending-up-outline',  iconFocused: 'trending-up' },
  { name: 'profile',  title: 'Profile',  icon: 'person-outline',       iconFocused: 'person' },
  { name: 'settings', title: 'Settings', icon: 'settings-outline',     iconFocused: 'settings' },
]

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: COLORS.acc,
        tabBarInactiveTintColor: COLORS.t3,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons
                name={focused ? tab.iconFocused : tab.icon}
                size={size}
                color={color}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  )
}
