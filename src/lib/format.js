// Formatação de valores, datas e cores.
import { COLOR_PALETTE } from "./constants";

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const formatCurrency = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
export const formatDateBR = (iso) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };

export function dateToISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function colorForEmail(email) {
  if (!email) return "#9A8A7A";
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

export function isDarkTheme(paper) {
  if (!paper) return false;
  const hex = paper.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 0.45;
}

export function formatCompact(v) {
  const abs = Math.abs(v);
  if (abs >= 1000) return `${v < 0 ? "-" : ""}${(abs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  return v.toFixed(0);
}
