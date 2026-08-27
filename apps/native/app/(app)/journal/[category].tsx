import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { GratitudeCategoryId } from "@rdm-b2c/api/domain/rdm";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import {
  AppScreen,
  ErrorState,
  LoadingState,
  PageHeader,
  PositiveActionDialog,
  PrimaryButton,
} from "@/components/rdm-ui";
import { colors, fonts, radii } from "@/lib/theme";
import { queryClient, trpc } from "@/utils/trpc";

type JournalCategory = {
  id: GratitudeCategoryId;
  journalTitle: string;
  journalSubtitle: string;
  prompt: string;
  placeholder: string;
  rewardMessage: string;
};

function JournalForm({
  category,
  initialEntry,
}: {
  category: JournalCategory;
  initialEntry: { body: string; processedAt: string | null } | null;
}) {
  const [body, setBody] = useState(initialEntry?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(Boolean(initialEntry?.processedAt));
  const [reward, setReward] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const saveEntry = useMutation(
    trpc.rdm.gratitude.save.mutationOptions({
      onSuccess: async (result) => {
        setSaved(true);
        setReward(result.reward);
        setDialogOpen(result.reward > 0);
        await queryClient.invalidateQueries();
      },
      onError: (mutationError) => setError(mutationError.message),
    }),
  );

  function submit() {
    setError(null);
    const trimmedBody = body.trim();
    if (trimmedBody.length < 4) {
      setError("Write at least a few words before saving your entry.");
      return;
    }
    saveEntry.mutate({ category: category.id, body: trimmedBody });
  }

  function closeDialog() {
    setDialogOpen(false);
    router.replace("/(app)/tree");
  }

  return (
    <>
      <AppScreen contentStyle={styles.content}>
        <PageHeader back subtitle={category.journalSubtitle} title={category.journalTitle} />

        <View style={styles.fieldGroup}>
          <Text style={styles.question}>{category.prompt}</Text>
          <TextInput
            accessibilityLabel={category.prompt}
            editable={!saved && !saveEntry.isPending}
            maxLength={1000}
            multiline
            onChangeText={setBody}
            placeholder={category.placeholder}
            placeholderTextColor={colors.inkSoft}
            style={[styles.journalInput, saved && styles.journalInputSaved]}
            textAlignVertical="top"
            value={body}
          />
          <View style={styles.inputMetaRow}>
            <Text style={styles.waterNote}>Saving waters your tree · +1 growth</Text>
            <Text style={styles.characterCount}>{body.length}/1000</Text>
          </View>
        </View>

        {saved ? (
          <View accessibilityRole="alert" style={styles.savedNotice}>
            <MaterialCommunityIcons color={colors.growth} name="check-circle-outline" size={18} />
            <Text style={styles.savedText}>Saved today · your tree has been watered.</Text>
          </View>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

        <PrimaryButton
          disabled={saved}
          label={saved ? "Saved today" : "Save entry"}
          loading={saveEntry.isPending}
          onPress={submit}
        />
      </AppScreen>

      <PositiveActionDialog
        message={category.rewardMessage}
        onConfirm={closeDialog}
        reward={reward}
        visible={dialogOpen}
      />
    </>
  );
}

export default function JournalEntryScreen() {
  const params = useLocalSearchParams<{ category?: string }>();
  const categoryId = String(params.category ?? "") as GratitudeCategoryId;
  const detail = useQuery(
    trpc.rdm.gratitude.byCategory.queryOptions({ category: categoryId }),
  );

  if (detail.isLoading) return <LoadingState label="Opening your journal…" />;
  if (detail.error || !detail.data) {
    return (
      <ErrorState
        message={detail.error?.message ?? "This journal prompt is unavailable."}
        onRetry={() => void detail.refetch()}
      />
    );
  }

  return (
    <JournalForm
      category={detail.data.category}
      initialEntry={detail.data.todayEntry}
    />
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  fieldGroup: { gap: 8 },
  question: { color: colors.inkSoft, fontFamily: fonts.bodyMedium, fontSize: 12 },
  journalInput: {
    minHeight: 164,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panelRaised,
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 13,
    fontStyle: "normal",
    lineHeight: 20,
    padding: 14,
  },
  journalInputSaved: { color: colors.inkSoft },
  inputMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  waterNote: { color: colors.ai, fontFamily: fonts.mono, fontSize: 9 },
  characterCount: { color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 9 },
  savedNotice: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: "rgba(63,203,139,0.25)",
    backgroundColor: colors.growthTint,
    paddingHorizontal: 12,
  },
  savedText: { flex: 1, color: colors.growth, fontFamily: fonts.bodyMedium, fontSize: 11 },
  error: { color: colors.coral, fontFamily: fonts.bodyMedium, fontSize: 12 },
});
