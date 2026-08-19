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

import { colors, fonts, radii } from "@/lib/theme";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export function AppScreen({
  children,
  scroll = true,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.screenContent, contentStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.screenContent, styles.flex, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
      {body}
    </SafeAreaView>
  );
}

export function PageHeader({
  title,
  subtitle,
  back = false,
  trailing,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={10}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.ink} />
        </Pressable>
      ) : null}
      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </View>
  );
}

export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={styles.sectionLabel}>{children}</Text>
      {action}
    </View>
  );
}

export function SurfaceCard({
  children,
  onPress,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.card, style, pressed && styles.cardPressed]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function IconBubble({
  name,
  color = colors.growth,
  backgroundColor = colors.growthTint,
  size = 20,
}: {
  name: IconName;
  color?: string;
  backgroundColor?: string;
  size?: number;
}) {
  return (
    <View style={[styles.iconBubble, { backgroundColor }]}>
      <MaterialCommunityIcons name={name} size={size} color={color} />
    </View>
  );
}

export function Pill({
  label,
  active = false,
  color = colors.growth,
  onPress,
}: {
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
      style={({ pressed }) => [
        styles.pill,
        active && { backgroundColor: color, borderColor: color },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>{label}</Text>
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  onPress,
  color = colors.growth,
  textColor = colors.backgroundDeep,
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
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        variant === "solid"
          ? { backgroundColor: color, borderColor: color }
          : { backgroundColor: "transparent", borderColor: color },
        isDisabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "solid" ? textColor : color} />
      ) : (
        <>
          {icon ? (
            <MaterialCommunityIcons
              name={icon}
              size={18}
              color={variant === "solid" ? textColor : color}
            />
          ) : null}
          <Text
            style={[
              styles.primaryButtonLabel,
              { color: variant === "solid" ? textColor : color },
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function ProgressBar({ progress, color = colors.growth }: { progress: number; color?: string }) {
  const safeProgress = Math.min(1, Math.max(0, progress));
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { backgroundColor: color, width: `${safeProgress * 100}%` }]} />
    </View>
  );
}

export function LoadingState({ label = "Growing your dashboard…" }: { label?: string }) {
  return (
    <View style={styles.centerState}>
      <ActivityIndicator color={colors.growth} size="large" />
      <Text style={styles.stateLabel}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.centerState}>
      <IconBubble name="cloud-alert-outline" color={colors.coral} backgroundColor={colors.coralTint} size={26} />
      <Text style={styles.errorTitle}>Something interrupted the flow</Text>
      <Text style={styles.stateLabel}>{message}</Text>
      {onRetry ? <PrimaryButton label="Try again" onPress={onRetry} variant="outline" color={colors.coral} /> : null}
    </View>
  );
}

export const rdmStyles = StyleSheet.create({
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 18 },
  body: { color: colors.ink, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  muted: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  mono: { color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center" },
});

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  screenContent: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 112, gap: 14 },
  header: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10 },
  backButton: { width: 36, height: 36, borderRadius: radii.small, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  headerTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 21 },
  headerSubtitle: { color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.4, marginTop: 2, textTransform: "uppercase" },
  sectionLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  sectionLabel: { color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase" },
  card: { backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: radii.medium, padding: 14 },
  cardPressed: { opacity: 0.82, transform: [{ scale: 0.995 }] },
  iconBubble: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  pill: { minHeight: 36, paddingHorizontal: 14, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, alignItems: "center", justifyContent: "center" },
  pillLabel: { color: colors.inkSoft, fontFamily: fonts.bodyBold, fontSize: 12 },
  pillLabelActive: { color: colors.backgroundDeep },
  primaryButton: { minHeight: 46, paddingHorizontal: 16, borderRadius: radii.pill, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryButtonLabel: { fontFamily: fonts.bodyBold, fontSize: 13 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.72 },
  progressTrack: { height: 8, borderRadius: 5, backgroundColor: "#2A2F3A", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 5 },
  centerState: { flex: 1, minHeight: 420, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 28 },
  stateLabel: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, textAlign: "center" },
  errorTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 18, textAlign: "center" },
});
