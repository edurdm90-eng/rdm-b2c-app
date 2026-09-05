import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts } from "@/lib/theme";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const icons: Record<string, IconName> = {
  index: "home-variant-outline",
  habits: "target",
  groups: "account-group-outline",
  games: "view-grid-outline",
  wallet: "wallet-outline",
};

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const tabBarBottomPadding = Math.max(insets.bottom, 10);

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.growth,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 10, marginTop: 1 },
        tabBarStyle: {
          height: 62 + tabBarBottomPadding,
          paddingTop: 8,
          paddingBottom: tabBarBottomPadding,
          backgroundColor: colors.background,
          borderTopColor: colors.line,
        },
        tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name={icons[route.name] ?? "circle-outline"} size={size} color={color} />,
      })}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="habits" options={{ title: "Habits" }} />
      <Tabs.Screen name="groups" options={{ title: "Groups" }} />
      <Tabs.Screen name="games" options={{ title: "Games" }} />
      <Tabs.Screen name="wallet" options={{ title: "Wallet" }} />
    </Tabs>
  );
}
