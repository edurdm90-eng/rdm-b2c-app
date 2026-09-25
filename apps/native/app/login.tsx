import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { FocusedScreen, focusedColors, focusedTypography } from "@/components/focused-ui";
import {
  authClient,
  syncBearerTokenFromOAuthCallback,
  syncBearerTokenFromSessionCookie,
} from "@/lib/auth-client";
import {
  loginCallbackParams,
  loginCallbackPath,
  loginReferralCode,
  postLoginDestination,
} from "@/lib/auth-return";
import { fonts } from "@/lib/theme";
import { queryClient, trpcClient } from "@/utils/trpc";

export default function LoginScreen() {
  const params = useLocalSearchParams();
  const [referralCode, setReferralCode] = useState(() => loginReferralCode(params) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const flowStarted = useRef(false);
  const callbackCookie = typeof params.cookie === "string" ? params.cookie : null;

  async function enterAuthenticatedApp(code: string | null) {
    const session = await authClient.getSession();
    if (!session.data?.user) return false;

    if (code) {
      try {
        await trpcClient.rdm.social.acceptReferral.mutate({ inviteCode: code });
      } catch {
        Alert.alert("Invite code not applied", "Your account is ready, but that invite code could not be accepted.");
      }
    }

    queryClient.clear();
    router.replace(postLoginDestination(params));
    return true;
  }

  useEffect(() => {
    if (!callbackCookie || flowStarted.current) return;

    flowStarted.current = true;
    setError(null);
    setSubmitting(true);
    void (async () => {
      try {
        const bearerStored = await syncBearerTokenFromOAuthCallback(callbackCookie);
        if (bearerStored) {
          // The callback carries a signed credential in its query string.
          // Remove it from router state before any network request can fail.
          router.replace({ pathname: "/login", params: loginCallbackParams(params) });
        }
        if (!bearerStored || !await enterAuthenticatedApp(loginReferralCode(params))) {
          setError("Google sign-in was not completed. Please try again.");
        }
      } catch {
        setError("RDM could not restore your Google session. Please try again.");
      } finally {
        flowStarted.current = false;
        setSubmitting(false);
      }
    })();
  }, [callbackCookie]);

  async function signInWithGoogle() {
    if (submitting) return;

    setError(null);
    const normalizedReferralCode = loginReferralCode({ referralCode });
    if (referralCode.trim() && !normalizedReferralCode) {
      setError("Invite codes contain exactly 6 letters or numbers.");
      return;
    }

    flowStarted.current = true;
    setSubmitting(true);
    try {
      const callbackURL = loginCallbackPath({ ...params, referralCode: normalizedReferralCode ?? undefined });
      const result = await authClient.signIn.social({
        provider: "google",
        // Better Auth's Expo plugin converts this route to the app's signed
        // rdm-b2c:// deep link and resumes here after the system browser closes.
        callbackURL,
        errorCallbackURL: callbackURL,
      });
      if (result.error) {
        setError(result.error.message ?? "Google sign-in could not be completed.");
        return;
      }

      const bearerStored = await syncBearerTokenFromSessionCookie();
      if (!bearerStored || !await enterAuthenticatedApp(normalizedReferralCode)) {
        setError("Google sign-in was not completed. Please try again.");
        return;
      }
    } catch {
      setError("RDM could not reach Google sign-in. Check your connection and try again.");
    } finally {
      flowStarted.current = false;
      setSubmitting(false);
    }
  }

  return (
    <FocusedScreen bottomSafe contentStyle={styles.screen}>
      <View style={styles.content}>
        <View style={styles.hero}>
          <Image
            accessibilityLabel="RDM"
            resizeMode="contain"
            source={require("@/assets/rdm/rdm-logo.png")}
            style={styles.logo}
          />
          <View style={styles.welcomeBadge}>
            <MaterialCommunityIcons name="sprout-outline" size={18} color={focusedColors.green} />
            <Text style={styles.welcomeBadgeText}>Your focused routine</Text>
          </View>
          <Text style={styles.title}>Your next good day starts here.</Text>
          <Text style={styles.subtitle}>
            Sign in once with Google to keep your routines, goals, rewards and progress securely in sync.
          </Text>
        </View>

        <View style={styles.actions}>
          <View style={styles.inviteField}>
            <Text style={styles.inviteLabel}>Invite code <Text style={styles.optional}>(optional)</Text></Text>
            <View style={styles.inviteInputRow}>
              <MaterialCommunityIcons name="tag-outline" size={20} color={focusedColors.muted} />
              <TextInput
                accessibilityLabel="Referral invite code"
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!submitting}
                maxLength={6}
                onChangeText={(value) => setReferralCode(value.toUpperCase())}
                placeholder="6-character code"
                placeholderTextColor={focusedColors.muted}
                returnKeyType="done"
                selectionColor={focusedColors.green}
                style={styles.inviteInput}
                value={referralCode}
              />
            </View>
          </View>

          {error ? (
            <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.errorCard}>
              <MaterialCommunityIcons name="alert-circle-outline" size={20} color={focusedColors.coral} />
              <Text style={styles.error}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityLabel="Continue with Google"
            accessibilityRole="button"
            accessibilityState={{ busy: submitting, disabled: submitting }}
            disabled={submitting}
            onPress={() => void signInWithGoogle()}
            style={({ pressed }) => [
              styles.googleButton,
              pressed && styles.pressed,
              submitting && styles.disabled,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={focusedColors.background} />
            ) : (
              <>
                <MaterialCommunityIcons name="google" size={22} color="#4285F4" />
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </>
            )}
          </Pressable>

          <View style={styles.securityRow}>
            <MaterialCommunityIcons name="shield-check-outline" size={17} color={focusedColors.muted} />
            <Text style={styles.securityText}>Secure sign-in. RDM never receives your Google password.</Text>
          </View>
          <Text style={styles.accountNote}>New to RDM? Your account is created automatically.</Text>
        </View>
      </View>
    </FocusedScreen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: "center", paddingHorizontal: 24, paddingVertical: 24 },
  content: { width: "100%", maxWidth: 420, minHeight: 560, alignSelf: "center", justifyContent: "space-between" },
  hero: { alignItems: "center", paddingTop: 22 },
  logo: { width: 218, height: 106, marginBottom: 22 },
  welcomeBadge: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderColor: focusedColors.line, borderRadius: 999, backgroundColor: focusedColors.panel, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 20 },
  welcomeBadgeText: { color: focusedColors.muted, fontFamily: fonts.bodyMedium, fontSize: 12.5 },
  title: { color: focusedColors.text, fontFamily: fonts.bodyBold, ...focusedTypography.heroTitle, letterSpacing: -0.6, textAlign: "center" },
  subtitle: { maxWidth: 350, color: focusedColors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 10, textAlign: "center" },
  actions: { paddingTop: 40, paddingBottom: 10 },
  inviteField: { gap: 7, marginBottom: 14 },
  inviteLabel: { color: focusedColors.text, fontFamily: fonts.bodyMedium, fontSize: 12.5 },
  optional: { color: focusedColors.muted, fontFamily: fonts.body },
  inviteInputRow: { minHeight: 46, borderWidth: 1, borderColor: focusedColors.line, borderRadius: 10, backgroundColor: focusedColors.panel, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 13 },
  inviteInput: { flex: 1, minHeight: 44, color: focusedColors.text, fontFamily: fonts.bodyMedium, fontSize: 14, letterSpacing: 1.2 },
  errorCard: { flexDirection: "row", alignItems: "flex-start", gap: 9, borderWidth: 1, borderColor: "rgba(255, 121, 100, 0.38)", borderRadius: 10, backgroundColor: "rgba(255, 121, 100, 0.08)", paddingHorizontal: 12, paddingVertical: 11, marginBottom: 12 },
  error: { flex: 1, color: focusedColors.coral, fontFamily: fonts.bodyMedium, fontSize: 12.5, lineHeight: 18 },
  googleButton: { minHeight: 52, borderRadius: 11, backgroundColor: focusedColors.text, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 11, paddingHorizontal: 18 },
  googleButtonText: { color: focusedColors.background, fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 20 },
  securityRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 16 },
  securityText: { color: focusedColors.muted, fontFamily: fonts.body, fontSize: 11.5, lineHeight: 17, textAlign: "center" },
  accountNote: { color: focusedColors.muted, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, marginTop: 9, textAlign: "center" },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.6 },
});
