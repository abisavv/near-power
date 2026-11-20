import { Stack, Tabs } from 'expo-router';
import { tabs } from '@/constants/data';
import { components, colors } from '@/constants/theme';
import { LucideIcon } from 'lucide-react-native';
import { useWindowDimensions, View } from 'react-native';
import { useApp } from '@/context/AppContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface TabBarProps {
  focused: boolean;
  icon: LucideIcon;
}

export default function AdminTabsLayout() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const tabBar = components.tabBar;
  const dynamicBarWidth = Math.min(
    tabs.length * tabBar.widthPerPill + tabBar.barPadding,
    screenWidth - tabBar.horizontalInset * 2 // Never overflow screen
  );
  const { isDarkMode: isDark } = useApp();
  const color = colors[isDark ? 'dark' : 'light'];

  const TabIcon = ({ focused, icon: Icon }: TabBarProps) => {
    const iconColor = focused ? (isDark ? '#F0E5F1' : '#3F2947') : (isDark ? '#B7A9BA' : '#625B63');
    return (
      <View className="ui-icon rounded-full">
        <View className={`ui-pill ${focused ? 'ui-pill-active' : ''}`}>
          <Icon color={iconColor} fill={focused ? iconColor : 'none'} strokeWidth={focused ? 3 : 2} size={21} />
        </View>
      </View>
    );
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: 'absolute',
          bottom: Math.max(insets.bottom, tabBar.horizontalInset),
          height: tabBar.height,
          width: dynamicBarWidth,
          // marginLeft: (screenWidth - dynamicBarWidth) / 2,
          alignSelf: 'center',
          marginHorizontal: tabBar.horizontalInset,
          backgroundColor: color.navBg,
          borderRadius: tabBar.radius,
          borderWidth: isDark ? 1 : 0,
          borderTopWidth: isDark ? 1 : 0,
          borderColor: isDark ? color.navBorder : 'transparent',

          // iOS Shadow (Light theme only)
          shadowColor: '#26172e', // Eclipse plum tint for a warmer, natural shadow
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: isDark ? 0 : 0.12,
          shadowRadius: isDark ? 0 : 16,

          // Android Shadow (Light theme only)
          elevation: isDark ? 0 : 6,
        },
        tabBarItemStyle: {
          paddingVertical: tabBar.height / 2 - tabBar.iconFrame / 1.6,
        },
        tabBarIconStyle: {
          width: tabBar.iconFrame,
          height: tabBar.iconFrame,
          alignItems: 'center',
        },
      }}>
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}

          options={{
            title: tab.title,
            tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon={tab.icon} />,
          }}
        />
      ))}
    </Tabs>
  );
}
