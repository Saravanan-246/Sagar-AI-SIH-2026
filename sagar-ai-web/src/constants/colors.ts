export const COLORS = {
  // Brand (Purple)
  primary: "#6D28D9",
  primaryHover: "#5B21B6",
  primarySoft: "#F3EDFF",
  primaryBorder: "#E0D5F7",

  // Base Neutrals (Slate / Surfaces)
  background: "#F8F8FB",
  surface: "#FFFFFF",
  surfaceSoft: "#FAF9FC",

  // Typography
  text: "#16151D",
  textSecondary: "#676572",
  textMuted: "#9795A2",

  // Borders
  border: "#E6E4EC",
  borderSoft: "#ECEAF1",

  // Feedback (Semantic)
  success: "#15803D",
  successSoft: "#ECFDF3",

  warning: "#B45309",
  warningSoft: "#FFF7ED",

  danger: "#C62828",
  dangerSoft: "#FEF2F2",

  info: "#2563EB",
  infoSoft: "#EFF6FF",

  // Utility
  overlay: "rgba(22, 21, 29, 0.42)",
} as const;

export type ColorKey = keyof typeof COLORS;