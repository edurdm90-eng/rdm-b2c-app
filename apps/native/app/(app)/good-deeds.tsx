import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { GoodDeedId } from "@rdm-b2c/api/domain/rdm";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  AppScreen,
  ErrorState,
  LoadingState,
  PageHeader,
  PositiveActionDialog,
  PrimaryButton,
  SurfaceCard,
} from "@/components/rdm-ui";
import { colors, fonts } from "@/lib/theme";
import { queryClient, trpc } from "@/utils/trpc";

type Notice = {
  message: string;
  tone: "error" | "info" | "success";
};

export default function GoodDeedsScreen() {
  const [selected, setSelected] = useState<Set<GoodDeedId>>(() => new Set());
  const [reward, setReward] = useState(0);
  const [rewardMessage, setRewardMessage] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const goodDeeds = useQuery(trpc.rdm.goodDeeds.today.queryOptions());
  const submitGoodDeeds = useMutation(
    trpc.rdm.goodDeeds.submit.mutationOptions({
      onSuccess: async (result) => {
        setSelected(new Set());
        setReward(result.reward);
        setRewardMessage(result.rewardMessage);
        setDialogOpen(result.reward > 0);
        setNotice({
          message: result.reward > 0
            ? `${result.completedCount} good deed${result.completedCount === 1 ? "" : "s"} saved for today.`
            : "Those good deeds were already saved today.",
          tone: result.reward > 0 ? "success" : "info",
        });
        await queryClient.invalidateQueries();
      },
      onError: (error) => setNotice({ message: error.message, tone: "error" }),
    }),
  );

  if (goodDeeds.isLoading) return <LoadingState label="Opening your good deeds register…" />;
  if (goodDeeds.error || !goodDeeds.data) {
    return (
      <ErrorState
        message={goodDeeds.error?.message ?? "Your good deeds register is unavailable."}
        onRetry={() => void goodDeeds.refetch()}
      />
    );
  }

  function toggleDeed(deedId: GoodDeedId, completed: boolean) {
    if (completed || submitGoodDeeds.isPending) return;
    setNotice(null);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(deedId)) next.delete(deedId);
      else next.add(deedId);
      return next;
    });
  }

  function submit() {
    if (selected.size === 0) return;
    setNotice(null);
    submitGoodDeeds.mutate({ deedIds: Array.from(selected) });
  }

  function closeDialog() {
    setDialogOpen(false);
    router.replace("/(app)/tree");
  }

  return (
    <>
      <AppScreen contentStyle={styles.content}>
        <PageHeader
          back
          subtitle="MARK OFF WHAT YOU DID TODAY"
          title="Good Deeds Register"
        />

        <SurfaceCard style={styles.registerCard}>
          {goodDeeds.data.deeds.map((deed, index) => {
            const deedId = deed.id as GoodDeedId;
            const checked = deed.completed || selected.has(deedId);
            return (
              <Pressable
                accessibilityLabel={`${deed.title}, ${deed.reward} RDM`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked, disabled: deed.completed }}
                disabled={deed.completed || submitGoodDeeds.isPending}
                key={deed.id}
                onPress={() => toggleDeed(deedId, deed.completed)}
                style={({ pressed }) => [
                  styles.deedRow,
                  index < goodDeeds.data.deeds.length - 1 && styles.deedDivider,
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                  {checked ? (
                    <MaterialCommunityIcons color={colors.ink} name="check" size={15} />
                  ) : null}
                </View>
                <Text style={styles.deedTitle}>{deed.title}</Text>
                <Text style={styles.deedReward}>+{deed.reward}</Text>
              </Pressable>
            );
          })}
        </SurfaceCard>

        {notice ? (
          <Text
            accessibilityRole="alert"
            style={[styles.notice, noticeToneStyles[notice.tone]]}
          >
            {notice.message}
          </Text>
        ) : null}

        <PrimaryButton
          color={colors.gold}
          disabled={selected.size === 0}
          label="Submit today's good deeds"
          loading={submitGoodDeeds.isPending}
          onPress={submit}
          style={styles.submitButton}
        />
      </AppScreen>

      <PositiveActionDialog
        message={rewardMessage}
        onConfirm={closeDialog}
        reward={reward}
        visible={dialogOpen}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  registerCard: { paddingHorizontal: 14, paddingVertical: 2 },
  deedRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 10,
  },
  deedDivider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  checkbox: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.line,
  },
  checkboxChecked: { backgroundColor: colors.growth, borderColor: colors.growth },
  deedTitle: {
    flex: 1,
    color: colors.ink,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  deedReward: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 10.5 },
  submitButton: { marginTop: 10 },
  notice: { fontFamily: fonts.bodyMedium, fontSize: 11, lineHeight: 16 },
  noticeError: { color: colors.coral },
  noticeInfo: { color: colors.inkSoft },
  noticeSuccess: { color: colors.growth },
  pressed: { opacity: 0.72 },
});

const noticeToneStyles = {
  error: styles.noticeError,
  info: styles.noticeInfo,
  success: styles.noticeSuccess,
} as const;
