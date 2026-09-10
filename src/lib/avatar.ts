const AVATAR_COLORS = [
  "#5B7461",
  "#B4402F",
  "#8A6D3B",
  "#3B6B8A",
  "#7A5B8F",
  "#B0563A",
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function avatarColor(name: string): string {
  return AVATAR_COLORS[hashName(name) % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const sum = parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return sum || "?";
}
