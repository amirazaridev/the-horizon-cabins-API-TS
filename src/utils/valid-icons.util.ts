import { VALID_ICONS } from "../constants/categoryIcons.js";


export type ValidIcon = (typeof VALID_ICONS)[number];

export function isValidIcon(icon: string): icon is ValidIcon {
  return (VALID_ICONS as readonly string[]).includes(icon);
}
