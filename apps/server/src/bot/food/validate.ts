// Sanity checks on resolved items. Anything the user stated is logged as they
// said it — we only warn, never silently "fix" their numbers.

export interface CheckedItem {
  name: string;
  grams: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  userStated: boolean;
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export function itemWarnings(item: CheckedItem): string[] {
  const warnings: string[] = [];
  const macroKcal = item.protein_g * 4 + item.carbs_g * 4 + item.fat_g * 9;

  if (item.protein_g * 4 > item.calories * 1.1 && item.protein_g > 5) {
    warnings.push(
      `${item.name}: ${fmt(item.protein_g)} g protein is ${fmt(item.protein_g * 4)} kcal on its own — more than the ${fmt(item.calories)} kcal logged.`,
    );
  } else if (
    item.calories > 0 &&
    macroKcal > 0 &&
    Math.abs(macroKcal - item.calories) > Math.max(item.calories * 0.25, 60)
  ) {
    warnings.push(
      `${item.name}: the macros add up to ~${fmt(macroKcal)} kcal, not ${fmt(item.calories)}.`,
    );
  }

  if (item.grams != null && item.grams > 0) {
    const macroGrams = item.protein_g + item.carbs_g + item.fat_g;
    if (macroGrams > item.grams * 1.05) {
      warnings.push(
        `${item.name}: ${fmt(macroGrams)} g of macros can't fit in ~${fmt(item.grams)} g of food.`,
      );
    }
  }

  if (item.calories > 3000) {
    warnings.push(
      `${item.name}: ${fmt(item.calories)} kcal is a lot for one item — double-check the amount.`,
    );
  }

  return warnings;
}
