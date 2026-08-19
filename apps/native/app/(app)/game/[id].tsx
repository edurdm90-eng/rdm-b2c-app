import { gameCatalog } from "@rdm-b2c/api/domain/rdm";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppScreen, ErrorState, PageHeader, PrimaryButton, ProgressBar, SurfaceCard, rdmStyles } from "@/components/rdm-ui";
import { colors, fonts, radii } from "@/lib/theme";
import { queryClient, trpc } from "@/utils/trpc";

type GameStatus = "idle" | "starting" | "running" | "saving" | "retry" | "complete";
type GameId = (typeof gameCatalog)[number]["id"];
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const breathPhases = ["Inhale", "Hold", "Exhale", "Rest"] as const;
const wordPrompts = ["B", "M", "S", "C", "R", "T"] as const;
const patternIcons = ["circle-outline", "triangle-outline", "square-outline"] as const satisfies ReadonlyArray<IconName>;
const gratitudePrompts = ["A person", "A small win", "A place", "A lesson"] as const;
const sortSets = [[8, 2, 5], [7, 1, 4], [9, 6, 3], [12, 10, 11]] as const;

function GameInteraction({
  gameId,
  round,
  onScore,
}: {
  gameId: GameId;
  round: number;
  onScore: (points?: number) => void;
}) {
  if (gameId === "pattern-match") {
    const targetIndex = round % patternIcons.length;
    return (
      <View style={styles.interactionCard}>
        <Text style={styles.interactionHint}>Match this symbol</Text>
        <MaterialCommunityIcons name={patternIcons[targetIndex]} size={54} color={colors.ai} />
        <View style={styles.optionRow}>
          {patternIcons.map((icon, index) => (
            <Pressable accessibilityLabel={`Pattern option ${index + 1}`} accessibilityRole="button" key={icon} onPress={() => index === targetIndex && onScore(15)} style={styles.optionButton}>
              <MaterialCommunityIcons name={icon} size={28} color={colors.ink} />
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  if (gameId === "sort-sprint") {
    const values = sortSets[round % sortSets.length];
    const smallest = Math.min(...values);
    return (
      <View style={styles.interactionCard}>
        <Text style={styles.interactionHint}>Tap the smallest number</Text>
        <View style={styles.optionRow}>
          {values.map((value) => (
            <Pressable accessibilityLabel={`Number ${value}`} accessibilityRole="button" key={value} onPress={() => value === smallest && onScore(15)} style={styles.numberButton}>
              <Text style={styles.numberText}>{value}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  if (gameId === "gratitude-tap") {
    return (
      <View style={styles.interactionCard}>
        <Text style={styles.interactionHint}>What feels worth noticing?</Text>
        <View style={styles.gratitudeGrid}>
          {gratitudePrompts.map((prompt) => (
            <Pressable accessibilityRole="button" key={prompt} onPress={() => onScore(10)} style={styles.gratitudeButton}>
              <MaterialCommunityIcons name="heart-outline" size={20} color={colors.plum} />
              <Text style={styles.gratitudeText}>{prompt}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  const isWord = gameId === "word-sprint";
  const isBox = gameId === "box-breathing";
  const phase = isWord ? wordPrompts[round % wordPrompts.length] : breathPhases[round % breathPhases.length];
  return (
    <Pressable accessibilityRole="button" onPress={() => onScore(isWord ? 10 : 8)} style={({ pressed }) => [styles.tapTarget, pressed && styles.tapPressed]}>
      <MaterialCommunityIcons name={isWord ? "format-letter-case" : isBox ? "square-outline" : "weather-windy"} size={52} color={colors.ai} />
      <Text style={styles.promptValue}>{phase}</Text>
      <Text style={styles.tapTitle}>{isWord ? `Bank a “${phase}” word` : isBox ? "Advance one side" : "Complete this breath phase"}</Text>
    </Pressable>
  );
}

export default function GamePlayScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const game = gameCatalog.find((item) => item.id === id);
  const duration = (game?.minutes ?? 1) * 60;
  const [secondsLeft, setSecondsLeft] = useState(duration);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(0);
  const [status, setStatus] = useState<GameStatus>("idle");
  const [reward, setReward] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expiresAtMs, setExpiresAtMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const finishing = useRef(false);

  const startGame = useMutation(trpc.rdm.games.start.mutationOptions({
    onSuccess: (result) => {
      setSessionId(result.sessionId);
      setExpiresAtMs(Date.parse(result.expiresAt));
      setSecondsLeft(result.secondsRemaining);
      setStatus("running");
    },
    onError: (mutationError) => {
      setStatus("idle");
      setError(mutationError.message);
    },
  }));

  const completeGame = useMutation(trpc.rdm.games.complete.mutationOptions({
    onSuccess: async (result) => {
      setReward(result.reward);
      setStatus("complete");
      finishing.current = false;
      await queryClient.invalidateQueries();
    },
    onError: (mutationError) => {
      setStatus("retry");
      setError(mutationError.message);
      finishing.current = false;
    },
  }));
  const checkpointScore = useMutation(trpc.rdm.games.progress.mutationOptions());

  const finish = useCallback(() => {
    if (!sessionId || finishing.current || (status !== "running" && status !== "retry")) return;
    finishing.current = true;
    setStatus("saving");
    completeGame.mutate({ sessionId });
  }, [completeGame, sessionId, status]);

  function addPoints() {
    if (sessionId) checkpointScore.mutate(
      { sessionId },
      {
        onSuccess: (result) => {
          setScore(result.score);
        },
      },
    );
    setRound((current) => current + 1);
  }

  function begin() {
    if (!game) return;
    setError(null);
    setStatus("starting");
    startGame.mutate({ gameId: game.id });
  }

  useEffect(() => {
    if (status !== "running" || expiresAtMs === null) return;
    const syncTimer = () => {
      const remainingMs = expiresAtMs - Date.now();
      setSecondsLeft(Math.max(0, Math.ceil(remainingMs / 1000)));
      if (remainingMs <= 750) queueMicrotask(finish);
    };
    syncTimer();
    const interval = setInterval(syncTimer, 250);
    return () => clearInterval(interval);
  }, [expiresAtMs, finish, status]);

  if (!game) return <ErrorState message="That game could not be found." />;

  const minutesLabel = Math.floor(secondsLeft / 60).toString().padStart(2, "0");
  const secondsLabel = (secondsLeft % 60).toString().padStart(2, "0");

  return (
    <AppScreen>
      <PageHeader back title={game.title} subtitle={`${game.minutes} minute responsible session`} />
      <SurfaceCard style={styles.hero}>
        <View style={styles.gameIcon}><MaterialCommunityIcons name={game.icon} size={48} color={colors.ai} /></View>
        <Text style={styles.gameTitle}>{game.title}</Text>
        <Text style={rdmStyles.muted}>{game.instruction} The session locks as soon as the timer reaches zero.</Text>
      </SurfaceCard>

      <View style={styles.timerCard}>
        <Text style={styles.timer}>{minutesLabel}:{secondsLabel}</Text>
        <ProgressBar color={colors.ai} progress={secondsLeft / duration} />
        <Text style={styles.timerNote}>{status === "idle" ? "Start when you are ready" : status === "complete" ? "Session locked · reward banked" : status === "retry" ? "Session locked · reconnect to bank reward" : "Stay inside this one short session"}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {status === "idle" || status === "starting" ? <PrimaryButton label="Start session" color={colors.ai} icon="play" loading={status === "starting"} onPress={begin} /> : null}
      {status === "running" || status === "saving" ? (
        <>
          <View pointerEvents={status === "running" ? "auto" : "none"}>
            <GameInteraction gameId={game.id} onScore={addPoints} round={round} />
          </View>
          <Text style={styles.score}>{score} points</Text>
          <PrimaryButton label="End session & bank score" color={colors.ai} loading={status === "saving"} variant="outline" onPress={finish} />
        </>
      ) : null}
      {status === "retry" ? <PrimaryButton label="Retry banking reward" color={colors.ai} icon="backup-restore" onPress={finish} /> : null}
      {status === "complete" ? (
        <View style={styles.completeCard}>
          <MaterialCommunityIcons name="check-decagram-outline" size={42} color={colors.growth} />
          <Text style={styles.completeTitle}>Reset complete</Text>
          <Text style={styles.reward}>+{reward} RDM</Text>
          <Text style={rdmStyles.muted}>Score {score} · this game is now locked for today.</Text>
        </View>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: 9, paddingVertical: 24 },
  gameIcon: { width: 84, height: 84, borderRadius: 26, backgroundColor: colors.aiTint, alignItems: "center", justifyContent: "center" },
  gameTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 24 },
  timerCard: { borderRadius: radii.large, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, padding: 18, gap: 12 },
  timer: { color: colors.ai, fontFamily: fonts.monoBold, fontSize: 42, textAlign: "center", letterSpacing: 2 },
  timerNote: { color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 9, textAlign: "center", textTransform: "uppercase" },
  tapTarget: { minHeight: 210, borderRadius: 34, backgroundColor: colors.aiTint, borderWidth: 2, borderColor: "rgba(95,166,237,0.38)", alignItems: "center", justifyContent: "center", gap: 8 },
  tapPressed: { transform: [{ scale: 0.98 }], backgroundColor: "rgba(95,166,237,0.2)" },
  tapTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 16 },
  promptValue: { color: colors.ai, fontFamily: fonts.display, fontSize: 34 },
  interactionCard: { minHeight: 210, borderRadius: 34, backgroundColor: colors.aiTint, borderWidth: 2, borderColor: "rgba(95,166,237,0.38)", alignItems: "center", justifyContent: "center", gap: 16, padding: 18 },
  interactionHint: { color: colors.inkSoft, fontFamily: fonts.monoBold, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6 },
  optionRow: { width: "100%", flexDirection: "row", justifyContent: "center", gap: 12 },
  optionButton: { width: 62, height: 62, borderRadius: 20, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  numberButton: { width: 68, height: 68, borderRadius: 22, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  numberText: { color: colors.ink, fontFamily: fonts.monoBold, fontSize: 23 },
  gratitudeGrid: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 9 },
  gratitudeButton: { width: "48%", minHeight: 54, borderRadius: 16, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.line, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10 },
  gratitudeText: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 11 },
  score: { color: colors.ai, fontFamily: fonts.monoBold, fontSize: 13, textAlign: "center" },
  error: { color: colors.coral, fontFamily: fonts.bodyMedium, fontSize: 12, textAlign: "center" },
  completeCard: { minHeight: 220, borderRadius: radii.large, backgroundColor: colors.growthTint, borderWidth: 1, borderColor: "rgba(63,203,139,0.3)", alignItems: "center", justifyContent: "center", gap: 10, padding: 20 },
  completeTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 24 },
  reward: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 18 },
});
