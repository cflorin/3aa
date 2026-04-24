// EPIC-004: Classification Engine & Universe Screen
// STORY-054: UI Theme Compliance — Dark Terminal Theme
// TASK-054-001: Theme constants matching docs/ui/project/3aa/app.jsx T object exactly

export const T = {
  bg: '#0b0d11',
  sidebarBg: '#0e1016',
  headerBg: '#0e1016',
  cardBg: '#131620',
  tableHead: '#0e1016',
  inputBg: '#0b0d11',
  text: '#d4d8e0',
  textMuted: '#8b92a5',
  textDim: '#4a5068',
  border: '#1e2230',
  borderFaint: '#181c27',
  rowHover: '#161a25',
  accent: '#2dd4bf',
} as const;

export type Theme = typeof T;
