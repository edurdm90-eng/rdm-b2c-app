export const GAMES_ROUTE = "/(app)/(tabs)/games" as const;

type GameExitRouter = {
  replace: (href: typeof GAMES_ROUTE) => void;
};

export function exitToGames(navigation: GameExitRouter) {
  navigation.replace(GAMES_ROUTE);
}
