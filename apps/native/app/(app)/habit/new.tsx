import { habitCategories, habitTemplates, type HabitCategory } from "@rdm-b2c/api/domain/rdm";
import { useMutation } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { AppScreen, PageHeader, Pill, PrimaryButton, SectionLabel } from "@/components/rdm-ui";
import { colors, fonts, radii } from "@/lib/theme";
import { queryClient, trpc } from "@/utils/trpc";

export default function NewHabitScreen() {
  const params = useLocalSearchParams<{ template?: string }>();
  const template = useMemo(() => habitTemplates.find((item) => item.id === params.template), [params.template]);
  const [title, setTitle] = useState(template?.title ?? "");
  const [category, setCategory] = useState<HabitCategory>(template?.category ?? "Focus");
  const [cadence, setCadence] = useState<string>(template?.cadence ?? "Daily");
  const [target, setTarget] = useState(template?.target ?? "");
  const [pledge, setPledge] = useState(template?.pledge ?? "");
  const [error, setError] = useState<string | null>(null);
  const createHabit = useMutation(trpc.rdm.habits.create.mutationOptions({
    onSuccess: async (habit) => {
      await queryClient.invalidateQueries();
      router.replace({ pathname: "/(app)/habit/[id]", params: { id: habit.id } });
    },
    onError: (mutationError) => setError(mutationError.message),
  }));

  function submit() {
    setError(null);
    if (title.trim().length < 2 || target.trim().length < 2 || pledge.trim().length < 8) {
      setError("Give the habit a name, a measurable target, and a clear pledge.");
      return;
    }
    createHabit.mutate({
      title: title.trim(),
      category,
      cadence: cadence.trim(),
      target: target.trim(),
      pledge: pledge.trim(),
      icon: template?.icon ?? "target",
      source: template ? "template" : "custom",
    });
  }

  return (
    <AppScreen>
      <PageHeader back title={template ? "Shape this habit" : "Build your habit"} subtitle={template ? `Starting from ${template.title}` : "Your framework, your words"} />
      <SectionLabel>Habit name</SectionLabel>
      <TextInput accessibilityLabel="Habit name" onChangeText={setTitle} placeholder="e.g. Read before bed" placeholderTextColor={colors.inkSoft} style={styles.input} value={title} />
      <SectionLabel>Category</SectionLabel>
      <View style={styles.pills}>{habitCategories.map((item) => <Pill key={item} active={category === item} label={item} onPress={() => setCategory(item)} />)}</View>
      <SectionLabel>Cadence</SectionLabel>
      <TextInput accessibilityLabel="Cadence" onChangeText={setCadence} placeholder="Daily, weekdays, three times a week…" placeholderTextColor={colors.inkSoft} style={styles.input} value={cadence} />
      <SectionLabel>Measurable target</SectionLabel>
      <TextInput accessibilityLabel="Target" onChangeText={setTarget} placeholder="What counts as done?" placeholderTextColor={colors.inkSoft} style={styles.input} value={target} />
      <SectionLabel>Your pledge</SectionLabel>
      <TextInput accessibilityLabel="Pledge" multiline onChangeText={setPledge} placeholder="I pledge to…" placeholderTextColor={colors.inkSoft} style={[styles.input, styles.multiline]} textAlignVertical="top" value={pledge} />
      <View style={styles.promiseNote}><Text style={styles.promiseTitle}>Keep it fair</Text><Text style={styles.promiseCopy}>A good pledge is specific enough to check and small enough to repeat on a difficult day.</Text></View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton label="Create habit" loading={createHabit.isPending} onPress={submit} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, color: colors.ink, fontFamily: fonts.body, fontSize: 14, paddingHorizontal: 14 },
  multiline: { minHeight: 118, paddingTop: 14, lineHeight: 20 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  promiseNote: { borderRadius: radii.medium, padding: 14, backgroundColor: colors.plumTint, borderWidth: 1, borderColor: "rgba(179,154,232,0.22)", gap: 4 },
  promiseTitle: { color: colors.plum, fontFamily: fonts.bodyBold, fontSize: 12 },
  promiseCopy: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  error: { color: colors.coral, fontFamily: fonts.bodyMedium, fontSize: 12 },
});
