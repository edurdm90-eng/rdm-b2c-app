import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AppScreen, ErrorState, IconBubble, LoadingState, PageHeader, Pill, PrimaryButton, SurfaceCard, rdmStyles } from "@/components/rdm-ui";
import { colors, fonts } from "@/lib/theme";
import { trpc } from "@/utils/trpc";
import { useState } from "react";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export default function FrameworkScreen() {
  const templates = useQuery(trpc.rdm.templates.queryOptions());
  const [category, setCategory] = useState("All");

  if (templates.isLoading) return <LoadingState label="Loading habit frameworks…" />;
  if (templates.error || !templates.data) return <ErrorState message={templates.error?.message ?? "Frameworks are unavailable."} onRetry={() => void templates.refetch()} />;

  const visibleTemplates = category === "All" ? templates.data.templates : templates.data.templates.filter((template) => template.category === category);

  return (
    <AppScreen>
      <PageHeader back title="Framework Path" subtitle="Pledge → Act → Reflect → Reward" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {["All", ...templates.data.categories].map((item) => (
          <Pill key={item} active={category === item} label={item} onPress={() => setCategory(item)} />
        ))}
      </ScrollView>
      <View style={styles.list}>
        {visibleTemplates.map((template) => (
          <SurfaceCard key={template.id} onPress={() => router.push({ pathname: "/(app)/habit/new", params: { template: template.id } })} style={styles.templateCard}>
            <IconBubble name={template.icon as IconName} color={template.category === "Money" ? colors.gold : template.category === "Sustainability" ? colors.plum : colors.growth} />
            <View style={styles.templateCopy}>
              <Text style={styles.templateTitle}>{template.title}</Text>
              <Text style={rdmStyles.muted}>{template.subtitle}</Text>
            </View>
            <View style={styles.plusButton}><MaterialCommunityIcons name="plus" size={20} color={colors.growth} /></View>
          </SurfaceCard>
        ))}
      </View>
      <PrimaryButton label="Build a custom habit" icon="plus" onPress={() => router.push({ pathname: "/(app)/habit/new", params: { template: "custom" } })} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  tabs: { gap: 8, paddingRight: 18 },
  list: { gap: 10 },
  templateCard: { flexDirection: "row", alignItems: "center", gap: 11 },
  templateCopy: { flex: 1, gap: 3 },
  templateTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 13 },
  plusButton: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: colors.growth, alignItems: "center", justifyContent: "center" },
});
