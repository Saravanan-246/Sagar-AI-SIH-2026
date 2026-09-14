export const COLORS = {
  primary: "#6D28D9",
  primaryHover: "#5B21B6",
  primarySoft: "#F3EDFF",
  primaryBorder: "#E0D5F7",

  background: "#F8F8FB",
  surface: "#FFFFFF",
  surfaceSoft: "#FAF9FC",

  text: "#16151D",
  textSecondary: "#676572",
  textMuted: "#9795A2",

  border: "#E6E4EC",
  borderSoft: "#ECEAF1",

  success: "#15803D",
  successSoft: "#ECFDF3",

  warning: "#B45309",
  warningSoft: "#FFF7ED",

  danger: "#C62828",
  dangerSoft: "#FEF2F2",

  info: "#2563EB",
  infoSoft: "#EFF6FF",

  overlay: "rgba(22, 21, 29, 0.42)",

  white: "#FFFFFF",
  black: "#000000",
} as const;

export type ColorKey = keyof typeof COLORS;