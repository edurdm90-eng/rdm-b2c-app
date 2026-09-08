import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AppScreen, PrimaryButton } from "@/components/rdm-ui";
import { authClient } from "@/lib/auth-client";
import { postLoginDestination } from "@/lib/auth-return";
import { colors, fonts, radii } from "@/lib/theme";
import { queryClient, trpcClient } from "@/utils/trpc";

type Mode = "sign-in" | "sign-up";

export default function LoginScreen() {
  const params = useLocalSearchParams();
  const { refetch: refreshSession } = authClient.useSession();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;
    setError(null);
    if (mode === "sign-up" && name.trim().length < 2) {
      setError("Enter the name you want your goals to use.");
      return;
    }
    if (!email.includes("@") || password.length < 8) {
      setError("Use a valid email and a password with at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const result = mode === "sign-in"
        ? await authClient.signIn.email({ email: email.trim(), password })
        : await authClient.signUp.email({ name: name.trim(), email: email.trim(), password });

      if (result.error) {
        setError(result.error.message ?? "We could not complete that request.");
        return;
      }

      if (mode === "sign-up" && inviteCode.trim()) {
        try {
          await trpcClient.rdm.social.acceptReferral.mutate({ inviteCode: inviteCode.trim() });
        } catch {
          Alert.alert("Invite code not applied", "Your account is ready, but that invite code could not be accepted.");
        }
      }

      await refreshSession();
      queryClient.clear();
      router.replace(postLoginDestination(params));
    } catch {
      setError("RDM could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppScreen scroll={false} contentStyle={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        <View style={styles.brandMark}>
          <MaterialCommunityIcons name="sprout" size={42} color={colors.growth} />
        </View>
        <Text style={styles.eyebrow}>PLEDGE · ACT · REFLECT · REWARD</Text>
        <Text style={styles.title}>{mode === "sign-in" ? "Welcome back" : "Start growing"}</Text>
        <Text style={styles.subtitle}>Small promises become visible progress when you keep showing up.</Text>

        <View style={styles.formCard}>
          {mode === "sign-up" ? (
            <>
              <TextInput accessibilityLabel="Name" autoCapitalize="words" onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.inkSoft} style={styles.input} value={name} />
              <TextInput accessibilityLabel="Referral code" autoCapitalize="characters" maxLength={6} onChangeText={setInviteCode} placeholder="Referral code (optional)" placeholderTextColor={colors.inkSoft} style={styles.input} value={inviteCode} />
            </>
          ) : null}
          <TextInput accessibilityLabel="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={setEmail} placeholder="Email address" placeholderTextColor={colors.inkSoft} style={styles.input} value={email} />
          <TextInput accessibilityLabel="Password" autoCapitalize="none" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} onChangeText={setPassword} onSubmitEditing={() => void submit()} placeholder="Password" placeholderTextColor={colors.inkSoft} secureTextEntry style={styles.input} value={password} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton label={mode === "sign-in" ? "Sign in" : "Create account"} loading={submitting} onPress={() => void submit()} />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setMode((current) => (current === "sign-in" ? "sign-up" : "sign-in"));
            setError(null);
          }}
          style={styles.switchMode}
        >
          <Text style={styles.switchText}>{mode === "sign-in" ? "New to RDM? Create an account" : "Already growing? Sign in"}</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: "center", paddingBottom: 32 },
  keyboard: { width: "100%", maxWidth: 420, alignSelf: "center" },
  brandMark: { width: 76, height: 76, borderRadius: 24, backgroundColor: colors.growthTint, borderWidth: 1, borderColor: "rgba(63, 203, 139, 0.28)", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  eyebrow: { color: colors.growth, fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 0.8 },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 34, marginTop: 8 },
  subtitle: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 24 },
  formCard: { backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: radii.large, padding: 16, gap: 12 },
  input: { minHeight: 50, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.line, borderRadius: 13, color: colors.ink, fontFamily: fonts.body, fontSize: 15, paddingHorizontal: 14 },
  error: { color: colors.coral, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 17 },
  switchMode: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 12 },
  switchText: { color: colors.plum, fontFamily: fonts.bodyBold, fontSize: 13 },
});
