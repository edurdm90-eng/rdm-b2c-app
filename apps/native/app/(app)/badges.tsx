import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";

import { AppScreen, ErrorState, LoadingState, PageHeader, SectionLabel } from "@/components/rdm-ui";
import { colors, fonts } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export default function BadgesScreen() {
  const badges = useQuery(trpc.rdm.social.badges.queryOptions());

  if (badges.isLoading) return <LoadingState label="Polishing your badges…" />;
  if (badges.error || !badges.data) return <ErrorState message={badges.error?.message ?? "Badges unavailable."} onRetry={() => void badges.refetch()} />;

  return (
    <AppScreen>
      <PageHeader back title="Badges" subtitle={`${badges.data.unlockedCount} of ${badges.data.badges.length} unlocked`} />
      {(["Bronze", "Silver", "Gold"] as const).map((tier) => (
        <View key={tier} style={styles.tier}>
          <SectionLabel>{tier}</SectionLabel>
          <View style={styles.grid}>
            {badges.data.badges.filter((badge) => badge.tier === tier).map((badge) => (
              <View key={badge.id} style={styles.badge}>
                <View style={[styles.ring, badge.unlocked && styles.unlockedRing, !badge.unlocked && styles.lockedRing]}>
                  <MaterialCommunityIcons name={badge.icon as IconName} size={28} color={badge.unlocked ? colors.gold : colors.inkSoft} />
                </View>
                <Text style={[styles.badgeName, !badge.unlocked && styles.lockedText]}>{badge.title}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  tier: { gap: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 18 },
  badge: { width: "31%", alignItems: "center", gap: 7 },
  ring: { width: 66, height: 66, borderRadius: 33, backgroundColor: colors.panel, borderWidth: 2, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  unlockedRing: { borderColor: colors.gold, backgroundColor: colors.goldTint },
  lockedRing: { opacity: 0.35 },
  badgeName: { color: colors.inkSoft, fontFamily: fonts.bodyMedium, fontSize: 10, lineHeight: 14, textAlign: "center" },
  lockedText: { opacity: 0.45 },
});
