import { normalizeNavigationFavorites } from "@/lib/userPreferences/navigationFavorites";

export function mergeLegacyFavorites(serverFavorites: string[], legacyFavorites: string[]): string[] {
  return normalizeNavigationFavorites([...serverFavorites, ...legacyFavorites]);
}

export function toggleServerFavorite(favorites: string[], page: string): string[] {
  return favorites.includes(page)
    ? favorites.filter((favorite) => favorite !== page)
    : [...favorites, page];
}
