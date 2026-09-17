import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { FocusedButton, FocusedScreen, focusedColors } from "@/components/focused-ui";
import { fonts } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

function categoryColor(category: string) {
  if (category === "Focus") return focusedColors.link;
  if (category === "Money") return focusedColors.gold;
  if (category === "Sustainability") return focusedColors.purple;
  return focusedColors.green;
}

export default function FrameworkScreen() {
  const templates = useQuery(trpc.rdm.templates.queryOptions());
  const [category, setCategory] = useState("All");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const visibleTemplates = (templates.data?.templates ?? []).filter((template) => category === "All" || template.category === category);
  const selectedTemplate = visibleTemplates.find((template) => template.id === selectedTemplateId) ?? visibleTemplates[0];

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(app)/(tabs)/habits");
  };

  return (
    <FocusedScreen scroll={false} bottomSafe contentStyle={styles.screenContent}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={goBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="arrow-left" size={28} color={focusedColors.text} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>Find your next habit</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>A small action you can repeat.</Text>

        {templates.isLoading ? (
          <View style={styles.status}>
            <ActivityIndicator color={focusedColors.green} />
            <Text style={styles.statusText}>Loading habit frameworks…</Text>
          </View>
        ) : templates.error || !templates.data ? (
          <View style={styles.status}>
            <Text accessibilityRole="alert" style={styles.statusText}>{templates.error?.message ?? "Frameworks are unavailable."}</Text>
            <FocusedButton label="Try again" onPress={() => void templates.refetch()} loading={templates.isFetching} style={styles.retryButton} />
          </View>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
              {["All", ...templates.data.categories].map((item) => (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityState={{ selected: category === item }}
                  aria-pressed={category === item}
                  onPress={() => { setCategory(item); setSelectedTemplateId(null); }}
                  style={({ pressed }) => [styles.category, category === item && styles.activeCategory, pressed && styles.pressed]}
                >
                  <Text style={[styles.categoryLabel, category === item && styles.activeCategoryLabel]}>{item}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text accessibilityRole="header" style={styles.sectionTitle}>Habit frameworks</Text>
            <View style={styles.list}>
              {visibleTemplates.map((template) => {
                const selected = selectedTemplate?.id === template.id;
                return (
                  <Pressable
                    key={template.id}
                    accessibilityRole="radio"
                    accessibilityLabel={`${template.title}, ${template.category}, ${template.subtitle}`}
                    accessibilityState={{ checked: selected }}
                    aria-checked={selected}
                    onPress={() => setSelectedTemplateId(template.id)}
                    style={({ pressed }) => [styles.templateCard, selected && styles.selectedCard, pressed && styles.pressed]}
                  >
                    <MaterialCommunityIcons name={template.icon as IconName} size={30} color={categoryColor(template.category)} />
                    <View style={styles.templateCopy}>
                      <Text style={styles.templateTitle}>{template.title}</Text>
                      <Text style={styles.templateCategory}>{template.category}</Text>
                      <Text style={styles.templateSubtitle}>{template.subtitle}</Text>
                    </View>
                    {selected ? (
                      <View style={styles.check}>
                        <MaterialCommunityIcons name="check" size={21} color={focusedColors.onGreen} />
                      </View>
                    ) : <MaterialCommunityIcons name="chevron-right" size={24} color={focusedColors.muted} />}
                  </Pressable>
                );
              })}
              {visibleTemplates.length === 0 && <Text style={styles.statusText}>No frameworks in this category yet. You can still create your own habit.</Text>}
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.actions}>
        <FocusedButton
          label="Use this habit"
          accessibilityLabel={selectedTemplate ? `Use ${selectedTemplate.title}` : "Use this habit"}
          disabled={!selectedTemplate || Boolean(templates.error)}
          onPress={() => {
            if (selectedTemplate) router.push({ pathname: "/(app)/habit/new", params: { template: selectedTemplate.id } });
          }}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/(app)/habit/new", params: { template: "custom" } })}
          style={({ pressed }) => [styles.customButton, pressed && styles.pressed]}
        >
          <Text style={styles.customLabel}>Create my own</Text>
        </Pressable>
      </View>
    </FocusedScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: { paddingHorizontal: 0, paddingTop: 16, paddingBottom: 0 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingBottom: 10 },
  backButton: { minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, color: focusedColors.text, fontFamily: fonts.bodyBold, fontSize: 20, lineHeight: 26 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20 },
  subtitle: { color: focusedColors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  categories: { gap: 7, paddingBottom: 4 },
  category: { minHeight: 36, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: focusedColors.line, backgroundColor: focusedColors.panel, alignItems: "center", justifyContent: "center" },
  activeCategory: { borderColor: focusedColors.link, backgroundColor: "#243A4B" },
  categoryLabel: { color: focusedColors.muted, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18 },
  activeCategoryLabel: { color: focusedColors.text },
  sectionTitle: { color: focusedColors.text, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, marginTop: 18, marginBottom: 9 },
  list: { gap: 9 },
  templateCard: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 68, paddingVertical: 11, paddingHorizontal: 12, borderWidth: 1, borderColor: focusedColors.line, borderRadius: 10, backgroundColor: focusedColors.panel },
  selectedCard: { borderColor: focusedColors.green },
  templateCopy: { flex: 1, gap: 2 },
  templateTitle: { color: focusedColors.text, fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 19 },
  templateCategory: { color: focusedColors.muted, fontFamily: fonts.body, fontSize: 11.5, lineHeight: 16 },
  templateSubtitle: { color: focusedColors.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  check: { width: 24, height: 24, borderRadius: 12, backgroundColor: focusedColors.green, alignItems: "center", justifyContent: "center" },
  actions: { gap: 10, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20, backgroundColor: focusedColors.background },
  customButton: { minHeight: 46, borderWidth: 1, borderColor: focusedColors.line, borderRadius: 10, backgroundColor: focusedColors.panel, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  customLabel: { color: focusedColors.muted, fontFamily: fonts.bodyMedium, fontSize: 13.5, lineHeight: 19 },
  status: { alignItems: "center", gap: 14, paddingVertical: 24 },
  statusText: { color: focusedColors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  retryButton: { alignSelf: "stretch" },
  pressed: { opacity: 0.8 },
});
