import { Fraunces_600SemiBold, useFonts as useFrauncesFonts } from "@expo-google-fonts/fraunces";
import { Inter_400Regular, Inter_600SemiBold, Inter_700Bold, useFonts as useInterFonts } from "@expo-google-fonts/inter";
import { JetBrainsMono_500Medium, JetBrainsMono_700Bold, useFonts as useJetBrainsFonts } from "@expo-google-fonts/jetbrains-mono";
import { focusManager, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, ThemeProvider } from "expo-router/react-navigation";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState, Platform, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { colors } from "@/lib/theme";
import { queryClient } from "@/utils/trpc";

void SplashScreen.preventAutoHideAsync();

const rdmNavigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.growth,
    background: colors.background,
    card: colors.panel,
    text: colors.ink,
    border: colors.line,
    notification: colors.coral,
  },
};

export default function RootLayout() {
  const [frauncesLoaded, frauncesError] = useFrauncesFonts({ Fraunces_600SemiBold });
  const [interLoaded, interError] = useInterFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const [monoLoaded, monoError] = useJetBrainsFonts({ JetBrainsMono_500Medium, JetBrainsMono_700Bold });
  const ready = (frauncesLoaded && interLoaded && monoLoaded) || !!(frauncesError || interError || monoError);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    focusManager.setFocused(AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", (state) => {
      focusManager.setFocused(state === "active");
    });
    return () => {
      subscription.remove();
      focusManager.setFocused(undefined);
    };
  }, []);

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={rdmNavigationTheme}>
        <StatusBar style="light" />
        <GestureHandlerRootView style={styles.container}>
          <Stack screenOptions={{ headerShown: false, contentStyle: styles.content }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="login" />
            <Stack.Screen name="(app)" />
          </Stack>
        </GestureHandlerRootView>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { backgroundColor: colors.background },
});
