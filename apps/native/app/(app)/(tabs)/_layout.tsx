import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Tabs } from "expo-router";

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
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.growth,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 10, marginTop: 1 },
        tabBarStyle: { height: 72, paddingTop: 8, paddingBottom: 10, backgroundColor: colors.background, borderTopColor: colors.line },
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
