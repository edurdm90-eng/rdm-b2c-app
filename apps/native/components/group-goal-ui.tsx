import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { StyleSheet, Text, View } from "react-native";

import { colors, fonts, radii } from "@/lib/theme";

export function GroupStepDots({ current, total = 5 }: { current: number; total?: number }) {
  return (
    <View
      accessibilityLabel={`Step ${current} of ${total}`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: current, text: `Step ${current} of ${total}` }}
      accessible
      style={styles.dots}
    >
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          style={[styles.dot, index < current ? styles.dotActive : styles.dotInactive]}
        />
      ))}
    </View>
  );
}

export function GroupAiNote({ label }: { label: string }) {
  return (
    <View style={styles.aiNote}>
      <MaterialCommunityIcons name="creation-outline" color={colors.ai} size={16} />
      <View style={styles.aiCopy}>
        <Text style={styles.aiLabel}>{label}</Text>
        <Text style={styles.aiSoon}>AI planning is coming later</Text>
      </View>
    </View>
  );
}

export function GroupAvatars({
  members,
}: {
  members: ReadonlyArray<{ initials: string }>;
}) {
  const visibleMembers = members.slice(0, 4);
  const remaining = members.length - visibleMembers.length;
  return (
    <View accessibilityLabel={`${members.length} group members`} style={styles.avatars}>
      {visibleMembers.map((member, index) => (
        <View key={`${member.initials}-${index}`} style={[styles.avatar, index > 0 && styles.overlap]}>
          <Text style={styles.avatarText}>{member.initials}</Text>
        </View>
      ))}
      {remaining > 0 ? (
        <View style={[styles.avatar, styles.overlap, styles.moreAvatar]}>
          <Text style={styles.avatarText}>+{remaining}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: "row", gap: 5 },
  dot: { flex: 1, height: 3, borderRadius: 2 },
  dotActive: { backgroundColor: colors.plum },
  dotInactive: { backgroundColor: colors.line },
  aiNote: {
    alignItems: "center",
    backgroundColor: colors.aiTint,
    borderColor: "rgba(95,166,237,0.3)",
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  aiCopy: { flex: 1 },
  aiLabel: { color: colors.ai, fontFamily: fonts.bodyMedium, fontSize: 11 },
  aiSoon: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 9, marginTop: 1 },
  avatars: { flexDirection: "row" },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.plum,
    borderColor: colors.panel,
    borderRadius: 16,
    borderWidth: 2,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  overlap: { marginLeft: -8 },
  moreAvatar: { backgroundColor: colors.panelRaised },
  avatarText: { color: colors.backgroundDeep, fontFamily: fonts.bodyBold, fontSize: 9 },
});
