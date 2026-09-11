import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useState, type ComponentProps, type ReactNode } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { FocusedButton, FocusedScreen, focusedColors } from "@/components/focused-ui";
import { authClient } from "@/lib/auth-client";
import { postLoginDestination } from "@/lib/auth-return";
import { fonts } from "@/lib/theme";
import { queryClient, trpcClient } from "@/utils/trpc";

type Mode = "sign-in" | "sign-up";

export default function LoginScreen() {
  const params = useLocalSearchParams();
  const { refetch: refreshSession } = authClient.useSession();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function changeMode(nextMode: Mode) {
    if (submitting) return;
    setMode(nextMode);
    setShowPassword(false);
    setError(null);
  }

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
    <FocusedScreen scroll={false} contentStyle={styles.screen} bottomSafe>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, mode === "sign-up" && styles.signupScrollContent]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            {mode === "sign-in" ? (
              <View style={styles.brandRow}>
                <MaterialCommunityIcons name="sprout-outline" size={68} color={focusedColors.green} />
                <Text style={styles.brandName}>RDM</Text>
              </View>
            ) : (
              <Pressable
                accessibilityLabel="Back to sign in"
                accessibilityRole="button"
                disabled={submitting}
                onPress={() => changeMode("sign-in")}
                style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name="arrow-left" size={23} color={focusedColors.muted} />
                <Text style={styles.backLabel}>Back</Text>
              </Pressable>
            )}

            <Text style={[styles.title, mode === "sign-up" && styles.signupTitle]}>
              {mode === "sign-in" ? "Your next good day starts here." : "Start with one small step."}
            </Text>
            <Text style={[styles.subtitle, mode === "sign-up" && styles.signupSubtitle]}>
              {mode === "sign-in"
                ? "Sign in to continue your routine."
                : "Create your account and begin your focused routine."}
            </Text>

            <View style={[styles.form, mode === "sign-up" && styles.signupForm]}>
              {mode === "sign-up" ? (
                <AuthField
                  label="Full name"
                  icon="account-outline"
                  autoCapitalize="words"
                  autoComplete="name"
                  editable={!submitting}
                  onChangeText={setName}
                  placeholder="Your full name"
                  value={name}
                />
              ) : null}
              <AuthField
                label="Email"
                icon="email-outline"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                editable={!submitting}
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="you@example.com"
                value={email}
              />
              <AuthField
                label="Password"
                icon="lock-outline"
                autoCapitalize="none"
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                autoCorrect={false}
                editable={!submitting}
                onChangeText={setPassword}
                onSubmitEditing={() => void submit()}
                placeholder={mode === "sign-in" ? "Your password" : "At least 8 characters"}
                returnKeyType="go"
                secureTextEntry={!showPassword}
                value={password}
                trailing={(
                  <Pressable
                    accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                    accessibilityRole="button"
                    accessibilityState={{ checked: showPassword }}
                    onPress={() => setShowPassword((visible) => !visible)}
                    style={({ pressed }) => [styles.passwordToggle, pressed && styles.pressed]}
                  >
                    <MaterialCommunityIcons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={23}
                      color={focusedColors.muted}
                    />
                  </Pressable>
                )}
              />
              {mode === "sign-up" ? (
                <AuthField
                  label="Invite code (optional)"
                  accessibilityLabel="Referral code"
                  icon="tag-outline"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!submitting}
                  maxLength={6}
                  onChangeText={setInviteCode}
                  placeholder="Enter invite code"
                  value={inviteCode}
                />
              ) : null}
            </View>

            {mode === "sign-up" ? (
              <View style={styles.airdropCard}>
                <MaterialCommunityIcons name="gift-outline" size={36} color={focusedColors.background} />
                <View style={styles.airdropCopy}>
                  <Text style={styles.airdropTitle}>500 RDM welcome airdrop</Text>
                  <Text style={styles.airdropDescription}>Added to your Base Purse when your account is created.</Text>
                </View>
              </View>
            ) : null}

            {error ? <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <FocusedButton
              label={mode === "sign-in" ? "Sign in" : "Create account"}
              loading={submitting}
              onPress={() => void submit()}
              style={styles.submitButton}
            />

            <View style={styles.switchRow}>
              <Text style={styles.switchPrompt}>{mode === "sign-in" ? "New to RDM?" : "Already a member?"}</Text>
              <Pressable
                accessibilityRole="button"
                disabled={submitting}
                onPress={() => changeMode(mode === "sign-in" ? "sign-up" : "sign-in")}
                style={({ pressed }) => [styles.switchButton, pressed && styles.pressed]}
              >
                <Text style={styles.switchLink}>{mode === "sign-in" ? "Create account" : "Sign in"}</Text>
              </Pressable>
            </View>

            {mode === "sign-in" ? (
              <View style={styles.footer}>
                <Image
                  accessible={false}
                  source={require("@/assets/images/focused-sprout.png")}
                  resizeMode="contain"
                  style={styles.sproutImage}
                />
                <Text style={styles.footerText}>Small actions. Lasting growth.</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </FocusedScreen>
  );
}

function AuthField({
  label,
  icon,
  trailing,
  accessibilityLabel = label,
  ...inputProps
}: TextInputProps & {
  label: string;
  icon: ComponentProps<typeof MaterialCommunityIcons>["name"];
  trailing?: ReactNode;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputRow, focused && styles.inputFocused]}>
        <MaterialCommunityIcons name={icon} size={23} color={focusedColors.muted} />
        <TextInput
          {...inputProps}
          accessibilityLabel={accessibilityLabel}
          onBlur={() => setFocused(false)}
          onFocus={() => setFocused(true)}
          placeholderTextColor={focusedColors.muted}
          selectionColor={focusedColors.green}
          style={styles.input}
        />
        {trailing}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  keyboard: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 36, paddingBottom: 24 },
  signupScrollContent: { paddingHorizontal: 22 },
  content: { width: "100%", maxWidth: 420, alignSelf: "center" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 28 },
  brandName: { color: focusedColors.text, fontFamily: fonts.bodyBold, fontSize: 34 },
  title: { color: focusedColors.text, fontFamily: fonts.bodyBold, fontSize: 34, lineHeight: 42, letterSpacing: -0.7 },
  signupTitle: { fontSize: 26, lineHeight: 34, letterSpacing: -0.5 },
  subtitle: { color: focusedColors.muted, fontFamily: fonts.body, fontSize: 16, lineHeight: 24, marginTop: 10, marginBottom: 32 },
  signupSubtitle: { marginBottom: 20 },
  backButton: { minHeight: 44, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 14, marginTop: -16, marginBottom: 16 },
  backLabel: { color: focusedColors.muted, fontFamily: fonts.body, fontSize: 14 },
  form: { gap: 24 },
  signupForm: { gap: 18 },
  field: { gap: 8 },
  fieldLabel: { color: focusedColors.muted, fontFamily: fonts.body, fontSize: 14 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingLeft: 14, paddingRight: 4, backgroundColor: focusedColors.panel, borderWidth: 1, borderColor: focusedColors.line, borderRadius: 10 },
  inputFocused: { borderColor: focusedColors.link },
  input: { flex: 1, minWidth: 0, minHeight: 50, paddingVertical: 12, paddingRight: 10, color: focusedColors.text, fontFamily: fonts.body, fontSize: 15, ...(Platform.OS === "web" ? { outlineWidth: 0 } : {}) },
  passwordToggle: { width: 44, height: 48, alignItems: "center", justifyContent: "center" },
  airdropCard: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 22, paddingHorizontal: 15, paddingVertical: 15, borderRadius: 10, backgroundColor: focusedColors.mint },
  airdropCopy: { flex: 1, gap: 5 },
  airdropTitle: { color: focusedColors.background, fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 21 },
  airdropDescription: { color: focusedColors.background, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  error: { color: focusedColors.coral, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 19, marginTop: 16 },
  submitButton: { borderRadius: 10, minHeight: 54, marginTop: 24 },
  switchRow: { borderTopWidth: 1, borderColor: focusedColors.line, marginTop: 28, paddingTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap" },
  switchPrompt: { color: focusedColors.muted, fontFamily: fonts.body, fontSize: 14 },
  switchButton: { minHeight: 44, justifyContent: "center" },
  switchLink: { color: focusedColors.link, fontFamily: fonts.bodyMedium, fontSize: 14 },
  footer: { alignItems: "center", marginTop: 26, gap: 12 },
  sproutImage: { width: "100%", height: 108 },
  footerText: { color: focusedColors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.72 },
});
