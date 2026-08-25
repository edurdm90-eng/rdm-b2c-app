import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Alert, StyleSheet, Text, View } from "react-native";

import { AppScreen, PageHeader, SurfaceCard } from "@/components/rdm-ui";
import { colors, fonts } from "@/lib/theme";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const thankYouOptions: Array<{
  icon: IconName;
  title: string;
  subtitle: string;
  nextStep: string;
}> = [
  {
    icon: "notebook-heart-outline",
    title: "All good things in your life",
    subtitle: "Opens a journal entry",
    nextStep: "Gratitude Journal",
  },
  {
    icon: "handshake-outline",
    title: "Anyone who helped you this week",
    subtitle: "Pick a name, send thanks",
    nextStep: "Send Thanks",
  },
  {
    icon: "heart-outline",
    title: "Your near and dear ones",
    subtitle: "Family, always first",
    nextStep: "Family Thanks",
  },
  {
    icon: "party-popper",
    title: "Your friends",
    subtitle: "A quick note goes a long way",
    nextStep: "Friend Thanks",
  },
  {
    icon: "briefcase-outline",
    title: "Your colleagues",
    subtitle: "Recognize a small assist",
    nextStep: "Colleague Thanks",
  },
];

export default function ThankYouScreen() {
  function showNextStep(title: string) {
    Alert.alert(title, "We will build this thank-you flow in the next step.");
  }

  return (
    <AppScreen contentStyle={styles.content}>
      <PageHeader back subtitle="GIVE THANKS TO —" title="Say Thank You" />

      <View style={styles.optionList}>
        {thankYouOptions.map((option) => (
          <SurfaceCard
            key={option.title}
            onPress={() => showNextStep(option.nextStep)}
            style={styles.optionCard}
          >
            <View style={styles.optionIcon}>
              <MaterialCommunityIcons color={colors.ai} name={option.icon} size={20} />
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
