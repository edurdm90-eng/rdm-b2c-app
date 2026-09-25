import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FocusedButton, focusedColors as palette, focusedTypography } from "@/components/focused-ui";
import { fonts, formatRdm } from "@/lib/theme";

export function TreeActionDialog({ visible, kind, reward, title, message, busy = false, onDone, onBackToTree }: {
  visible: boolean;
  kind: "water" | "sunlight";
  reward: number;
  title: string;
  message: string;
  busy?: boolean;
  onDone: () => void;
  onBackToTree: () => void;
}) {
  function dismiss() { if (!busy) onDone(); }
  return (
    <Modal animationType="fade" onRequestClose={dismiss} statusBarTranslucent transparent visible={visible}>
      <SafeAreaView style={styles.overlay}>
        <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable accessible={false} disabled={busy} onPress={dismiss} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={styles.card}>
            <View style={styles.closeRow}>
              <Pressable accessibilityRole="button" accessibilityLabel="Close saved confirmation" accessibilityState={{ disabled: busy }} disabled={busy} onPress={dismiss} style={styles.closeButton}>
                <MaterialCommunityIcons name="close" color={palette.muted} size={25} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <View style={styles.symbol}>
                <MaterialCommunityIcons name={kind === "water" ? "water" : "white-balance-sunny"} size={80} color={kind === "water" ? palette.link : palette.gold} />
                <View style={styles.check}><MaterialCommunityIcons name="check-circle" size={37} color={palette.green} /></View>
              </View>
              <Text style={styles.support}>{kind === "water" ? "A little gratitude. A little growth." : "A little kindness. A little growth."}</Text>
              <Text accessibilityRole="header" style={styles.title}>{title}</Text>
              {reward > 0 ? <View style={styles.reward}>
                <View style={styles.rewardAmount}><MaterialCommunityIcons name="circle-double" size={34} color={palette.gold} /><Text style={styles.amount}>+{formatRdm(reward)} RDM</Text></View>
                <Text style={styles.support}>Added to your Reward Purse</Text>
              </View> : <View style={styles.reward}><Text style={styles.support}>Already recorded. No extra RDM was added.</Text></View>}
              <View style={styles.message}><Text style={styles.messageText}>{message}</Text></View>
              <FocusedButton label="Back to my tree" disabled={busy} onPress={onBackToTree} style={styles.button} />
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={dismiss} style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}><Text style={styles.doneLabel}>Done</Text></Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(4, 8, 12, 0.78)" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 16, paddingVertical: 18 },
  card: { width: "100%", maxWidth: 370, maxHeight: "100%", backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.line, borderRadius: 14 },
  closeRow: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 6, paddingTop: 4 },
  closeButton: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  content: { paddingHorizontal: 20, paddingBottom: 22, alignItems: "center", gap: 12 },
  symbol: { position: "relative", width: 86, height: 91, alignItems: "center", justifyContent: "center" },
  check: { position: "absolute", right: 0, bottom: 0, backgroundColor: palette.panel, borderRadius: 20 },
  support: { color: palette.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20, textAlign: "center" },
  title: { color: palette.text, fontFamily: fonts.bodyBold, ...focusedTypography.heroTitle, textAlign: "center" },
  reward: { gap: 8, paddingTop: 12, paddingBottom: 9, alignItems: "center" },
  rewardAmount: { flexDirection: "row", alignItems: "center", gap: 12 },
  amount: { color: palette.gold, fontFamily: fonts.bodyBold, fontSize: 30, lineHeight: 39 },
  message: { width: "100%", borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 16, paddingBottom: 13 },
  messageText: { color: palette.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, textAlign: "center" },
  button: { width: "100%" },
  doneButton: { width: "100%", minHeight: 50, borderWidth: 1, borderColor: palette.muted, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  doneLabel: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 14 },
  pressed: { opacity: 0.75 },
});
