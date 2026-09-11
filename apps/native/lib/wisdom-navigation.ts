import { router } from "expo-router";

export function goBackToJapaneseWisdom() {
  if (router.canGoBack()) router.back();
  else router.replace("/(app)/(tabs)/japanese-wisdom");
}
