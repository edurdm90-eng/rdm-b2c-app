import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { AppScreen, PageHeader, PrimaryButton, SurfaceCard } from "@/components/rdm-ui";
import { colors, fonts } from "@/lib/theme";

export default function AiCoachScreen() {
  return (
    <AppScreen>
      <PageHeader back title="RDM Coach" subtitle="Habit & goal suggestions" />
      <SurfaceCard style={styles.notice}>
        <MaterialCommunityIcons name="creation-outline" size={36} color={colors.ai} />
        <Text style={styles.title}>AI suggestions are not available yet</Text>
        <Text style={styles.description}>You can create a habit from the framework or set your own goal while we prepare the coach.</Text>
      </SurfaceCard>
      <PrimaryButton label="Browse habit framework" color={colors.ai} icon="clipboard-check-outline" onPress={() => router.replace("/(app)/framework")} />
      <PrimaryButton label="Create a goal" color={colors.plum} icon="flag-outline" onPress={() => router.replace("/(app)/goal/new")} variant="outline" />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  notice: { alignItems: "center", gap: 14, paddingVertical: 28 },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 20, textAlign: "center" },
  description: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 13, lineHeight: 20, textAlign: "center" },
});
