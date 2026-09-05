import { Redirect, Stack } from "expo-router";

import { LoadingState } from "@/components/rdm-ui";
import { authClient } from "@/lib/auth-client";
import { colors } from "@/lib/theme";

export default function ProtectedLayout() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return <LoadingState label="Loading your RDM space…" />;
  if (!session?.user) return <Redirect href="/login" />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="framework" />
      <Stack.Screen name="ai-coach" />
      <Stack.Screen name="habit/new" />
      <Stack.Screen name="habit/[id]" />
      <Stack.Screen name="tree" />
      <Stack.Screen name="streak-missed" />
      <Stack.Screen name="good-deeds" />
      <Stack.Screen name="thank-you" />
      <Stack.Screen name="journal/[category]" />
      <Stack.Screen name="game/[id]" />
      <Stack.Screen name="group/new" />
      <Stack.Screen name="leaderboard" />
      <Stack.Screen name="badges" />
    </Stack>
  );
}
