import { Tabs } from 'expo-router';
import { LayoutDashboard, ReceiptText, UserRound } from 'lucide-react-native';
import { useApp } from '@/context/AppContext';

export default function ConsumerLayout() {
  const { isDarkMode } = useApp();
  const active = isDarkMode ? '#E9D9EC' : '#4D3155';
  const inactive = isDarkMode ? '#A99BAE' : '#817782';
  return <Tabs screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: active,
    tabBarInactiveTintColor: inactive,
    tabBarStyle: { position: 'absolute', left: 18, right: 18, bottom: 12, height: 66, borderRadius: 22,
      backgroundColor: isDarkMode ? '#211A25' : '#FFFFFF', borderTopWidth: 0,
      elevation: 8, paddingTop: 8, paddingBottom: 8 },
    tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
  }}>
    <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, focused }) => <LayoutDashboard size={21} color={color} fill={focused ? color : 'none'} /> }} />
    <Tabs.Screen name="bills" options={{ title: 'Bills', tabBarIcon: ({ color, focused }) => <ReceiptText size={21} color={color} fill={focused ? color : 'none'} /> }} />
    <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, focused }) => <UserRound size={21} color={color} fill={focused ? color : 'none'} /> }} />
  </Tabs>;
}
