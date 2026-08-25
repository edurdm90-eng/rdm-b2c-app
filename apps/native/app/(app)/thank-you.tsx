import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { AppScreen, ErrorState, LoadingState, PageHeader, SurfaceCard } from "@/components/rdm-ui";
import { colors, fonts } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export default function ThankYouScreen() {
  const categories = useQuery(trpc.rdm.gratitude.categories.queryOptions());

  if (categories.isLoading) return <LoadingState label="Loading your gratitude prompts…" />;
  if (categories.error || !categories.data) {
    return (
      <ErrorState
        message={categories.error?.message ?? "Gratitude prompts are unavailable."}
        onRetry={() => void categories.refetch()}
      />
    );
  }

  return (
    <AppScreen contentStyle={styles.content}>
      <PageHeader back subtitle="GIVE THANKS TO —" title="Say Thank You" />

      <View style={styles.optionList}>
        {categories.data.map((option) => (
          <SurfaceCard
            key={option.id}
            onPress={() => router.push({
              pathname: "/(app)/journal/[category]",
              params: { category: option.id },
            })}
            style={styles.optionCard}
          >
            <View style={styles.optionIcon}>
              <MaterialCommunityIcons color={colors.ai} name={option.icon as IconName} size={20} />
            </View>
            <View style={styles.optionCopy}>
              <Text style={styles.optionTitle}>{option.title}</Text>
              <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
            </View>
            <MaterialCommunityIcons color={colors.inkSoft} name="arrow-right" size={19} />
          </SurfaceCard>
        ))}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  optionList: { gap: 10 },
  optionCard: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optionIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: colors.aiTint,
  },
  optionCopy: { flex: 1, gap: 3 },
  optionTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 13 },
  optionSubtitle: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 10 },
});
