import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Tabs } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { focusedColors } from "@/components/focused-ui";
import { fonts } from "@/lib/theme";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const icons: Record<string, IconName> = {
  index: "home-variant-outline",
  habits: "leaf-circle-outline",
  goals: "bullseye-arrow",
  groups: "account-group-outline",
  games: "gamepad-variant-outline",
  wallet: "wallet-outline",
  "japanese-wisdom": "bowl-mix-outline",
};

type AppTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>>[0];

function AppTabBar({ state, descriptors, navigation }: AppTabBarProps) {
  const insets = useSafeAreaInsets();
  const scrollView = useRef<ScrollView>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const itemWidth = Math.max(64, availableWidth / state.routes.length);
  const overflowing = availableWidth > 0 && itemWidth * state.routes.length > availableWidth;

  useEffect(() => {
    scrollView.current?.scrollTo({
      x: Math.max(0, state.index * itemWidth - (availableWidth - itemWidth) / 2),
      animated: true,
    });
  }, [availableWidth, itemWidth, state.index]);

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6), paddingLeft: insets.left, paddingRight: insets.right }]}>
      {overflowing ? <Text style={styles.scrollHint}>Swipe for all tabs ↔</Text> : null}
      <ScrollView
        horizontal
        onLayout={(event) => setAvailableWidth(event.nativeEvent.layout.width)}
        ref={scrollView}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.items}
        style={styles.scroll}
      >
        {state.routes.map((route, index) => {
          const options = descriptors[route.key]?.options;
          const focused = state.index === index;
          const color = focused ? focusedColors.green : focusedColors.muted;
          const label = route.name === "japanese-wisdom" ? "Wisdom" : options?.title ?? route.name;
          return (
            <Pressable
              key={route.key}
              accessibilityLabel={options?.tabBarAccessibilityLabel ?? options?.title ?? label}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              aria-selected={focused}
              onPress={() => {
                const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              }}
              onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
              style={({ pressed }) => [styles.item, { width: itemWidth }, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name={focused && route.name === "index" ? "home-variant" : focused && route.name === "wallet" ? "wallet" : icons[route.name] ?? "circle-outline"} size={21} color={color} />
              <Text style={[styles.label, { color }]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
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
  bar: { backgroundColor: focusedColors.background, borderTopWidth: 1, borderTopColor: focusedColors.line, paddingTop: 3 },
  items: { alignItems: "center" },
  scroll: { height: 44, flexGrow: 0 },
  item: { minHeight: 44, alignItems: "center", justifyContent: "center", gap: 1, paddingHorizontal: 3 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 8, textAlign: "center" },
  scrollHint: { fontFamily: fonts.body, fontSize: 10, color: focusedColors.muted, textAlign: "right", paddingHorizontal: 12, paddingBottom: 2 },
  pressed: { opacity: 0.7 },
});
