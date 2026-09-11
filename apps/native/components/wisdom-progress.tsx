import { StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";

import { ProgressBar, rdmStyles } from "@/components/rdm-ui";
import { colors } from "@/lib/theme";

type WisdomProgressValue = {
  completedDays: number;
  totalDays: number;
  missedDays: number;
  unresolvedDays: number;
};

export function WisdomProgress({
  wisdom,
  showRemaining = false,
  textStyle,
}: {
  wisdom: WisdomProgressValue;
  showRemaining?: boolean;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={styles.progress}>
      <ProgressBar color={colors.plum} progress={wisdom.totalDays > 0 ? wisdom.completedDays / wisdom.totalDays : 0} />
      <Text style={[rdmStyles.muted, textStyle]}>
        {wisdom.completedDays}/{wisdom.totalDays} days completed · {wisdom.missedDays} missed
        {showRemaining ? ` · ${wisdom.unresolvedDays} remaining` : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { gap: 11 },
});
