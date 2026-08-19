import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { AppScreen, PageHeader, PrimaryButton } from "@/components/rdm-ui";
import { colors, fonts, radii } from "@/lib/theme";

const messages = [
  { from: "ai", text: "Hey — what is one thing in your day you would like to change, even a little?" },
  { from: "me", text: "I keep getting distracted after lunch and lose the afternoon." },
  { from: "ai", text: "That sounds like a focus dip, not a discipline problem. We can turn it into one fair daily habit." },
  { from: "me", text: "Help me make it measurable." },
  { from: "ai", text: "Next, I will help shape the pledge, schedule, reminders, and check-ins with you." },
] as const;

export default function AiCoachScreen() {
  return (
    <AppScreen>
      <PageHeader back title="RDM Coach" subtitle="AI-guided habit path" trailing={<View style={styles.status}><View style={styles.statusDot} /><Text style={styles.statusText}>preview</Text></View>} />
      <View style={styles.notice}>
        <MaterialCommunityIcons name="creation-outline" size={22} color={colors.ai} />
        <View style={styles.noticeCopy}><Text style={styles.noticeTitle}>Conversation is designed and ready</Text><Text style={styles.noticeText}>The AI model and habit-generation logic will be connected in the next pass.</Text></View>
      </View>
      <View style={styles.chatBody}>
        {messages.map((message, index) => (
          <View key={`${message.from}-${index}`} style={[styles.bubble, message.from === "me" ? styles.myBubble : styles.aiBubble]}>
            <Text style={[styles.bubbleText, message.from === "me" && styles.myBubbleText]}>{message.text}</Text>
          </View>
        ))}
      </View>
      <View style={styles.composer}><Text style={styles.composerText}>AI replies will be enabled later</Text><View style={styles.sendButton}><MaterialCommunityIcons name="arrow-up" size={19} color={colors.backgroundDeep} /></View></View>
      <PrimaryButton label="Use the framework for now" color={colors.ai} icon="clipboard-check-outline" onPress={() => router.replace("/(app)/framework")} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.aiTint, borderRadius: radii.pill, paddingHorizontal: 9, minHeight: 30 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.ai },
  statusText: { color: colors.ai, fontFamily: fonts.monoBold, fontSize: 9, textTransform: "uppercase" },
  notice: { flexDirection: "row", gap: 10, padding: 13, borderRadius: radii.medium, backgroundColor: colors.aiTint, borderWidth: 1, borderColor: "rgba(95,166,237,0.24)" },
  noticeCopy: { flex: 1, gap: 3 },
  noticeTitle: { color: colors.ai, fontFamily: fonts.bodyBold, fontSize: 12 },
  noticeText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, lineHeight: 16 },
  chatBody: { gap: 10, paddingVertical: 6 },
  bubble: { maxWidth: "82%", borderRadius: 16, paddingHorizontal: 13, paddingVertical: 11 },
  aiBubble: { alignSelf: "flex-start", backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: 4 },
  myBubble: { alignSelf: "flex-end", backgroundColor: colors.ai, borderBottomRightRadius: 4 },
  bubbleText: { color: colors.ink, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  myBubbleText: { color: "#0A1622", fontFamily: fonts.bodyMedium },
  composer: { minHeight: 52, borderRadius: radii.pill, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, paddingLeft: 16, paddingRight: 7, flexDirection: "row", alignItems: "center", gap: 8 },
  composerText: { flex: 1, color: colors.inkSoft, fontFamily: fonts.body, fontSize: 12 },
  sendButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.ai, alignItems: "center", justifyContent: "center", opacity: 0.55 },
});
