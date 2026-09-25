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

import { FocusedButton, FocusedScreen, focusedColors, focusedTypography } from "@/components/focused-ui";
import { authClient, googleAuthEnabled, syncBearerTokenFromSessionCookie } from "@/lib/auth-client";
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
      const verified = await authClient.getSession();
      if (!verified.data?.user) {
        setError("Sign-in succeeded, but the session could not be saved on this device. Please try again.");
        return;
      }
      queryClient.clear();
      router.replace(postLoginDestination(params));
    } catch {
      setError("RDM could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function signInWithGoogle() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        // The Expo Better Auth client turns this relative route into RDM's
        // signed deep link, then completes the browser flow in-app.
        callbackURL: "/login",
      });
      if (result.error) {
        setError(result.error.message ?? "Google sign-in could not be completed.");
        return;
      }

      await refreshSession();
      const verified = await authClient.getSession();
      if (!verified.data?.user || !await syncBearerTokenFromSessionCookie()) {
        setError("Google sign-in completed, but the session could not be saved on this device. Please try again.");
        return;
      }
      queryClient.clear();
      router.replace(postLoginDestination(params));
    } catch {
      setError("Google sign-in could not be completed. Check your connection and try again.");
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

            {googleAuthEnabled ? (
              <>
                <View style={styles.orRow}>
                  <View style={styles.orLine} />
                  <Text style={styles.orText}>or</Text>
                  <View style={styles.orLine} />
                </View>
                <Pressable
                  accessibilityLabel="Continue with Google"
                  accessibilityRole="button"
                  disabled={submitting}
                  onPress={() => void signInWithGoogle()}
                  style={({ pressed }) => [styles.googleButton, pressed && styles.pressed, submitting && styles.disabled]}
                >
                  <MaterialCommunityIcons name="google" size={20} color={focusedColors.text} />
                  <Text style={styles.googleButtonText}>Continue with Google</Text>
                </Pressable>
              </>
            ) : null}

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
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 26, paddingBottom: 20 },
  signupScrollContent: { paddingHorizontal: 20 },
  content: { width: "100%", maxWidth: 420, alignSelf: "center" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  brandName: { color: focusedColors.text, fontFamily: fonts.bodyBold, fontSize: 28 },
  title: { color: focusedColors.text, fontFamily: fonts.bodyBold, ...focusedTypography.heroTitle, letterSpacing: -0.6 },
  signupTitle: { fontSize: 22, lineHeight: 29, letterSpacing: -0.4 },
  subtitle: { color: focusedColors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 24 },
  signupSubtitle: { marginBottom: 16 },
  backButton: { minHeight: 40, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 12, marginTop: -12, marginBottom: 12 },
  backLabel: { color: focusedColors.muted, fontFamily: fonts.body, fontSize: 13 },
  form: { gap: 18 },
  signupForm: { gap: 14 },
  field: { gap: 7 },
  fieldLabel: { color: focusedColors.muted, fontFamily: fonts.body, fontSize: 13 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 11, minHeight: 46, paddingLeft: 13, paddingRight: 4, backgroundColor: focusedColors.panel, borderWidth: 1, borderColor: focusedColors.line, borderRadius: 10 },
  inputFocused: { borderColor: focusedColors.link },
  input: { flex: 1, minWidth: 0, minHeight: 44, paddingVertical: 10, paddingRight: 9, color: focusedColors.text, fontFamily: fonts.body, fontSize: 14, ...(Platform.OS === "web" ? { outlineWidth: 0 } : {}) },
  passwordToggle: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
  airdropCard: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 16, paddingHorizontal: 13, paddingVertical: 13, borderRadius: 10, backgroundColor: focusedColors.mint },
  airdropCopy: { flex: 1, gap: 4 },
  airdropTitle: { color: focusedColors.background, fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 20 },
  airdropDescription: { color: focusedColors.background, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  error: { color: focusedColors.coral, fontFamily: fonts.bodyMedium, fontSize: 12.5, lineHeight: 18, marginTop: 12 },
  submitButton: { borderRadius: 10, minHeight: 48, marginTop: 18 },
  orRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  orLine: { flex: 1, height: 1, backgroundColor: focusedColors.line },
  orText: { color: focusedColors.muted, fontFamily: fonts.body, fontSize: 12 },
  googleButton: { minHeight: 48, marginTop: 14, borderRadius: 10, borderWidth: 1, borderColor: focusedColors.line, backgroundColor: focusedColors.panel, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  googleButtonText: { color: focusedColors.text, fontFamily: fonts.bodyMedium, fontSize: 14 },
  disabled: { opacity: 0.55 },
  switchRow: { borderTopWidth: 1, borderColor: focusedColors.line, marginTop: 20, paddingTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, flexWrap: "wrap" },
  switchPrompt: { color: focusedColors.muted, fontFamily: fonts.body, fontSize: 14 },
  switchButton: { minHeight: 44, justifyContent: "center" },
  switchLink: { color: focusedColors.link, fontFamily: fonts.bodyMedium, fontSize: 14 },
  footer: { alignItems: "center", marginTop: 26, gap: 12 },
  sproutImage: { width: "100%", height: 108 },
  footerText: { color: focusedColors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.72 },
});
