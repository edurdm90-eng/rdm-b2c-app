import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { GratitudeCategoryId } from "@rdm-b2c/api/domain/rdm";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { focusedColors as palette } from "@/components/focused-ui";
import { ErrorState, LoadingState } from "@/components/rdm-ui";
import { TreePage } from "@/components/tree-ui";
import { fonts } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
const categoryPresentation: Record<GratitudeCategoryId, { icon: IconName; color: string; description: string }> = {
  life: { icon: "star", color: palette.gold, description: "Big or small, it all counts" },
  helper: { icon: "account-group-outline", color: palette.link, description: "A kind word goes a long way" },
  "loved-ones": { icon: "heart-outline", color: palette.coral, description: "Family and the people closest to you" },
  friends: { icon: "account-group-outline", color: palette.link, description: "Support, fun and everyday moments" },
  colleagues: { icon: "briefcase-outline", color: palette.muted, description: "Teamwork and shared progress" },
};

export default function ThankYouScreen() {
  const categories = useQuery(trpc.rdm.gratitude.categories.queryOptions());
  if (categories.isLoading) return <LoadingState label="Loading your gratitude prompts…" />;
  if (categories.error || !categories.data) return <ErrorState message={categories.error?.message ?? "Gratitude prompts are unavailable."} onRetry={() => void categories.refetch()} />;

  return (
    <TreePage title="Say Thank You" footer={<View style={styles.footer}><Text style={styles.footerText}>A few honest words are enough.</Text></View>}>
      <View style={styles.intro}>
        <View style={styles.hero}><MaterialCommunityIcons name="water-outline" size={60} color={palette.link} /><Text accessibilityRole="header" style={styles.title}>Who or what made today better?</Text></View>
        <Text style={styles.subtitle}>Gratitude helps you see the good, and adds water to your tree.</Text>
      </View>
      <View style={styles.list}>
        {categories.data.map((category) => {
          const visual = categoryPresentation[category.id];
          return <Pressable key={category.id} accessibilityRole="button" accessibilityLabel={category.title} accessibilityHint="Open this gratitude journal" onPress={() => router.push({ pathname: "/(app)/journal/[category]", params: { category: category.id } })} style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
            <MaterialCommunityIcons name={visual.icon} color={visual.color} size={35} />
            <View style={styles.copy}><Text style={styles.optionTitle}>{category.title}</Text><Text style={styles.optionDescription}>{visual.description}</Text></View>
            <MaterialCommunityIcons name="chevron-right" color={palette.muted} size={24} />
          </Pressable>;
        })}
      </View>
    </TreePage>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 12, paddingBottom: 7 },
  hero: { flexDirection: "row", alignItems: "center", gap: 20 },
  title: { flex: 1, color: palette.text, fontFamily: fonts.bodyBold, fontSize: 25, lineHeight: 31 },
  subtitle: { color: palette.muted, fontFamily: fonts.body, fontSize: 15, lineHeight: 23 },
  list: { gap: 9 },
  option: { minHeight: 83, paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 16, borderWidth: 1, borderColor: palette.line, borderRadius: 9, backgroundColor: palette.panel },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  optionTitle: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20 },
  optionDescription: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  footer: { paddingTop: 16, paddingBottom: 5, borderTopWidth: 1, borderTopColor: palette.line },
  footerText: { color: palette.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20, textAlign: "center" },
  pressed: { opacity: 0.75 },
});
