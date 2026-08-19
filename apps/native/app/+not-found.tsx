import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { AppScreen, PrimaryButton } from "@/components/rdm-ui";
import { colors, fonts } from "@/lib/theme";

export default function NotFoundScreen() {
  return (
    <AppScreen scroll={false} contentStyle={styles.screen}>
      <View style={styles.icon}><MaterialCommunityIcons name="map-marker-question-outline" size={44} color={colors.plum} /></View>
      <Text style={styles.title}>This path has not grown yet</Text>
      <Text style={styles.copy}>The page may have moved, but your progress is safe.</Text>
      <PrimaryButton label="Return home" onPress={() => router.replace("/")} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 30 },
  icon: { width: 82, height: 82, borderRadius: 26, backgroundColor: colors.plumTint, alignItems: "center", justifyContent: "center" },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 24, textAlign: "center" },
  copy: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 13, lineHeight: 20, textAlign: "center", marginBottom: 6 },
});
