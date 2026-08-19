import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { AppScreen, PageHeader, Pill, PrimaryButton, SectionLabel } from "@/components/rdm-ui";
import { colors, fonts } from "@/lib/theme";
import { queryClient, trpc } from "@/utils/trpc";

export default function NewGroupScreen() {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("km");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const createGroup = useMutation(trpc.rdm.groups.create.mutationOptions({
    onSuccess: async () => { await queryClient.invalidateQueries(); router.replace("/(app)/(tabs)/groups"); },
    onError: (mutationError) => setError(mutationError.message),
  }));
  const joinGroup = useMutation(trpc.rdm.groups.join.mutationOptions({
    onSuccess: async () => { await queryClient.invalidateQueries(); router.replace("/(app)/(tabs)/groups"); },
    onError: (mutationError) => setError(mutationError.message),
  }));

  function submit() {
    if (mode === "join") {
      if (inviteCode.trim().length !== 6) {
        setError("Enter the six-character invite code.");
        return;
      }
      setError(null);
      joinGroup.mutate({ inviteCode: inviteCode.trim() });
      return;
    }
    const numericTarget = Number(target);
    if (name.trim().length < 3 || !Number.isFinite(numericTarget) || numericTarget <= 0 || unit.trim().length < 1) {
      setError("Add a group name, a positive target, and a unit.");
      return;
    }
    setError(null);
    createGroup.mutate({ name: name.trim(), target: numericTarget, unit: unit.trim() });
  }

  return (
    <AppScreen>
      <PageHeader back title="Group goal" subtitle={mode === "create" ? "Grow together, award fairly" : "Join with an invite code"} />
      <View style={styles.modeRow}>
        <Pill active={mode === "create"} color={colors.plum} label="Create" onPress={() => setMode("create")} />
        <Pill active={mode === "join"} color={colors.plum} label="Join" onPress={() => setMode("join")} />
      </View>
      {mode === "create" ? (
        <>
          <SectionLabel>Group goal name</SectionLabel>
          <TextInput accessibilityLabel="Group name" onChangeText={setName} placeholder="e.g. Family Fitness Streak" placeholderTextColor={colors.inkSoft} style={styles.input} value={name} />
          <SectionLabel>Target</SectionLabel>
          <TextInput accessibilityLabel="Target" keyboardType="decimal-pad" onChangeText={setTarget} placeholder="500" placeholderTextColor={colors.inkSoft} style={styles.input} value={target} />
          <SectionLabel>Unit</SectionLabel>
          <TextInput accessibilityLabel="Unit" autoCapitalize="none" onChangeText={setUnit} placeholder="km, hours, sessions…" placeholderTextColor={colors.inkSoft} style={styles.input} value={unit} />
        </>
      ) : (
        <>
          <SectionLabel>Invite code</SectionLabel>
          <TextInput accessibilityLabel="Invite code" autoCapitalize="characters" autoCorrect={false} maxLength={6} onChangeText={setInviteCode} placeholder="A1B2C3" placeholderTextColor={colors.inkSoft} style={[styles.input, styles.codeInput]} value={inviteCode} />
          <Text style={styles.help}>Ask the group creator for the code shown on their Group Goal card.</Text>
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton label={mode === "create" ? "Create group goal" : "Join group"} color={colors.plum} loading={createGroup.isPending || joinGroup.isPending} onPress={submit} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 52, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, color: colors.ink, fontFamily: fonts.body, fontSize: 14, paddingHorizontal: 14 },
  modeRow: { flexDirection: "row", gap: 8 },
  codeInput: { fontFamily: fonts.monoBold, fontSize: 24, letterSpacing: 5, textAlign: "center", textTransform: "uppercase" },
  help: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  error: { color: colors.coral, fontFamily: fonts.bodyMedium, fontSize: 12 },
});
