import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Tabs } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { focusedColors } from "@/components/focused-ui";
import { fonts } from "@/lib/theme";
import { queryClient, trpc } from "@/utils/trpc";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const icons = {
  index: "home-variant-outline",
  habits: "leaf-circle-outline",
  goals: "bullseye-arrow",
  groups: "account-group-outline",
  games: "gamepad-variant-outline",
  wallet: "wallet-outline",
  "japanese-wisdom": "bowl-mix-outline",
} satisfies Record<string, IconName>;

type AppTabRouteName = keyof typeof icons;

type AppTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>>[0];

function isAppTabRouteName(routeName: string): routeName is AppTabRouteName {
  return Object.hasOwn(icons, routeName);
}

function prefetchTab(routeName: AppTabRouteName) {
  switch (routeName) {
    case "index":
      return queryClient.prefetchQuery(trpc.rdm.dashboard.queryOptions());
    case "habits":
    case "japanese-wisdom":
      return queryClient.prefetchQuery(trpc.rdm.habits.list.queryOptions());
    case "goals":
      return queryClient.prefetchQuery(trpc.rdm.goals.list.queryOptions());
    case "groups":
      return queryClient.prefetchQuery(trpc.rdm.groups.list.queryOptions());
    case "games":
      return queryClient.prefetchQuery(trpc.rdm.games.list.queryOptions());
    case "wallet":
      return queryClient.prefetchQuery(trpc.rdm.wallet.summary.queryOptions());
  }
}

function AppTabBar({ state, descriptors, navigation }: AppTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6), paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View style={styles.items}>
        {state.routes.map((route, index) => {
          const options = descriptors[route.key]?.options;
          const focused = state.index === index;
          const color = focused ? focusedColors.green : focusedColors.muted;
          const label = route.name === "japanese-wisdom" ? "Wisdom" : options?.title ?? route.name;
          const icon = isAppTabRouteName(route.name) ? icons[route.name] : "circle-outline";
          return (
            <Pressable
              key={route.key}
              accessibilityLabel={options?.tabBarAccessibilityLabel ?? options?.title ?? label}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              aria-selected={focused}
              onPressIn={() => {
                if (!focused && isAppTabRouteName(route.name)) void prefetchTab(route.name);
              }}
              onPress={() => {
                const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              }}
              onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name={focused && route.name === "index" ? "home-variant" : focused && route.name === "wallet" ? "wallet" : icon} size={22} color={color} />
              <Text numberOfLines={1} style={[styles.label, { color }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <AppTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="habits" options={{ title: "Habits" }} />
      <Tabs.Screen name="goals" options={{ title: "Goals" }} />
      <Tabs.Screen name="groups" options={{ title: "Groups" }} />
      <Tabs.Screen name="games" options={{ title: "Games" }} />
      <Tabs.Screen name="japanese-wisdom" options={{ title: "Japanese Wisdom", tabBarAccessibilityLabel: "Japanese Wisdom" }} />
      <Tabs.Screen name="wallet" options={{ title: "Wallet" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: focusedColors.background, borderTopWidth: 1, borderTopColor: focusedColors.line, paddingTop: 4 },
  items: { alignItems: "center", flexDirection: "row", width: "100%" },
  item: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", gap: 2, paddingHorizontal: 1 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 10, lineHeight: 13, textAlign: "center" },
  pressed: { opacity: 0.7 },
});
