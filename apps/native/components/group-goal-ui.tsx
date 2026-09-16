import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ErrorState } from "@/components/rdm-ui";
import { focusedColors } from "@/components/focused-ui";
import { colors, fonts, radii } from "@/lib/theme";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export function GroupScreen({ children, scroll = true, contentStyle }: {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={groupStyles.safeArea}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[groupStyles.content, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={groupStyles.viewport}
        >
          {children}
        </ScrollView>
      ) : <View style={[groupStyles.viewport, groupStyles.content, contentStyle]}>{children}</View>}
    </SafeAreaView>
  );
}

export function GroupPageHeader({ title, subtitle, back = false, onBack, trailing }: {
  title: string;
  subtitle?: string;
  back?: boolean;
  onBack?: () => void;
  trailing?: ReactNode;
}) {
  // A trailing element (e.g. a settings icon) always shares the title row with
  // the back button, so a subtitle can't also go inline there without the two
  // colliding. When both are present, the subtitle drops to its own row below
  // instead of being silently discarded; otherwise it keeps its original
  // placement (inline "step" text for back headers, or under the title).
  const subtitleBelow = !!subtitle && (!back || !!trailing);
  const subtitleInline = !!subtitle && back && !trailing;
  return (
    <View style={groupStyles.headerStack}>
      <View style={[groupStyles.header, !back && groupStyles.headerWithoutBack]}>
        {back ? (
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={10}
            onPress={onBack ?? (() => router.back())}
            style={({ pressed }) => [groupStyles.backButton, pressed && groupStyles.pressed]}
          >
            <MaterialCommunityIcons color={focusedColors.text} name="arrow-left" size={27} />
          </Pressable>
        ) : null}
        <View style={groupStyles.headerCopy}>
          <Text style={groupStyles.headerTitle}>{title}</Text>
          {!back && subtitleBelow ? <Text style={groupStyles.headerSubtitle}>{subtitle}</Text> : null}
        </View>
        {trailing ?? (subtitleInline ? <Text style={groupStyles.headerStep}>{subtitle}</Text> : null)}
      </View>
      {back && subtitleBelow ? <Text style={groupStyles.headerSubtitleBelow}>{subtitle}</Text> : null}
    </View>
  );
}

export function GroupSurfaceCard({ children, onPress, style }: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [groupStyles.card, style, pressed && groupStyles.pressed]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[groupStyles.card, style]}>{children}</View>;
}

export function GroupPrimaryButton({
  label,
  onPress,
  color = focusedColors.green,
  textColor = focusedColors.onGreen,
  icon,
  disabled = false,
  loading = false,
  variant = "solid",
  style,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  textColor?: string;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  variant?: "solid" | "outline";
  style?: StyleProp<ViewStyle>;
}) {
  const unavailable = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: unavailable }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        groupStyles.primaryButton,
        variant === "solid" ? { backgroundColor: color, borderColor: color } : { borderColor: color },
        unavailable && groupStyles.disabled,
        pressed && groupStyles.pressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={variant === "solid" ? textColor : color} /> : (
        <>
          {icon ? <MaterialCommunityIcons color={variant === "solid" ? textColor : color} name={icon} size={21} /> : null}
          <Text style={[groupStyles.primaryButtonLabel, { color: variant === "solid" ? textColor : color }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function GroupSectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <View style={groupStyles.sectionRow}><Text style={groupStyles.sectionLabel}>{children}</Text>{action}</View>;
}

export function GroupPill({ label, active = false, color = focusedColors.link, onPress }: {
  label: string;
  active?: boolean;
  color?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [groupStyles.pill, active && { borderColor: color, backgroundColor: "rgba(102, 199, 255, 0.08)" }, pressed && groupStyles.pressed]}
    >
      <Text style={[groupStyles.pillLabel, active && groupStyles.pillLabelActive]}>{label}</Text>
    </Pressable>
  );
}

export function GroupErrorState({ message, onBack, onRetry }: { message: string; onBack: () => void; onRetry?: () => void }) {
  return (
    <GroupScreen scroll={false}>
      <GroupPageHeader back onBack={onBack} title="Group goal" />
      <ErrorState message={message} onRetry={onRetry} />
    </GroupScreen>
  );
}

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
    borderColor: focusedColors.panel,
    borderRadius: 16,
    borderWidth: 2,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  overlap: { marginLeft: -8 },
  moreAvatar: { backgroundColor: focusedColors.line },
  avatarText: { color: colors.backgroundDeep, fontFamily: fonts.bodyBold, fontSize: 9 },
});

const groupStyles = StyleSheet.create({
  safeArea: { backgroundColor: focusedColors.background, flex: 1 },
  viewport: { alignSelf: "center", flex: 1, maxWidth: 480, width: "100%" },
  content: { flexGrow: 1, gap: 15, paddingBottom: 28, paddingHorizontal: 18, paddingTop: 18 },
  headerStack: { gap: 4 },
  header: { alignItems: "center", flexDirection: "row", minHeight: 42 },
  headerWithoutBack: { alignItems: "flex-start" },
  backButton: { alignItems: "center", height: 42, justifyContent: "center", marginLeft: -8, marginRight: 7, width: 42 },
  headerCopy: { flex: 1 },
  headerTitle: { color: focusedColors.text, fontFamily: fonts.bodyBold, fontSize: 20, lineHeight: 27 },
  headerSubtitle: { color: focusedColors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 3 },
  headerSubtitleBelow: { color: focusedColors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, marginLeft: 42 },
  headerStep: { color: focusedColors.muted, fontFamily: fonts.body, fontSize: 13 },
  card: { backgroundColor: focusedColors.panel, borderColor: focusedColors.line, borderRadius: 10, borderWidth: 1, padding: 14 },
  primaryButton: { alignItems: "center", borderRadius: 8, borderWidth: 1, flexDirection: "row", gap: 9, justifyContent: "center", minHeight: 52, paddingHorizontal: 14 },
  primaryButtonLabel: { fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 21, textAlign: "center" },
  disabled: { opacity: 0.46 },
  pressed: { opacity: 0.78 },
  sectionRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  sectionLabel: { color: focusedColors.text, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20 },
  pill: { alignItems: "center", backgroundColor: focusedColors.panel, borderColor: focusedColors.line, borderRadius: 8, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 42, paddingHorizontal: 10 },
  pillLabel: { color: focusedColors.muted, fontFamily: fonts.bodyMedium, fontSize: 13, textAlign: "center" },
  pillLabelActive: { color: focusedColors.text },
});
