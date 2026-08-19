import { Redirect } from "expo-router";

import { LoadingState } from "@/components/rdm-ui";
import { authClient } from "@/lib/auth-client";

export default function EntryScreen() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return <LoadingState label="Preparing your space…" />;
  return <Redirect href={session?.user ? "/(app)/(tabs)" : "/login"} />;
}
