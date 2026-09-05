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

// Converte o que o usuário digitou num número.
//
// O jeito antigo — parseFloat(String(v).replace(",", ".")) — quebrava com
// separador de milhar: "1.234,56" virava "1.234.56" e o parseFloat parava no
// segundo ponto, devolvendo 1.234. O usuário cadastrava R$ 1.234,56 e o sistema
// guardava R$ 1,23.
//
// Regras (ordem importa):
//   "1.234,56" → 1234.56   (BR: ponto milhar, vírgula decimal)
//   "1,234.56" → 1234.56   (US: manda o separador que aparece por último)
//   "1234,56"  → 1234.56
//   "1.234"    → 1234      (ponto com exatamente 3 dígitos depois = milhar)
//   "1.5"      → 1.5       (não são 3 dígitos, então é decimal mesmo)
//   "R$ 80,00" → 80        (símbolos e espaços são descartados)
export function parseMoedaBR(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  let s = String(valor ?? "").trim();
  if (!s) return 0;

  const negativo = /^-/.test(s) || /\(.*\)/.test(s);
  s = s.replace(/[^\d.,]/g, "");
  if (!s) return 0;

  const iVirgula = s.lastIndexOf(",");
  const iPonto = s.lastIndexOf(".");

  if (iVirgula >= 0 && iPonto >= 0) {
    s = iVirgula > iPonto
      ? s.replace(/\./g, "").replace(",", ".")   // 1.234,56
      : s.replace(/,/g, "");                     // 1,234.56
  } else if (iVirgula >= 0) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (iPonto >= 0) {
    const partes = s.split(".");
    const ultima = partes[partes.length - 1];
    // Vários pontos, ou um ponto seguido de exatamente 3 dígitos: é milhar.
    if (partes.length > 2 || (ultima.length === 3 && partes[0].length > 0)) s = partes.join("");
  }

  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return negativo && n > 0 ? -n : n;
}

// Dia do mês válido (1 a 31) ou null. Os inputs number com max="31" não impedem
// digitação em todos os navegadores, então a validação precisa existir aqui.
export function clampDia(valor) {
  const n = parseInt(String(valor ?? "").replace(/\D/g, ""), 10);
  if (!Number.isFinite(n) || n < 1 || n > 31) return null;
  return n;
}

function hexParaRgb(hex) {
  const limpo = String(hex || "").replace("#", "");
  const full = limpo.length === 3 ? limpo.split("").map((c) => c + c).join("") : limpo;
  if (full.length !== 6 || /[^0-9a-f]/i.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

export function ehHexValido(hex) {
  return hexParaRgb(hex) !== null;
}

function luminancia(hex) {
  const rgb = hexParaRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Razão de contraste WCAG entre duas cores (1 = idênticas, 21 = preto/branco).
export function contraste(corA, corB) {
  const a = luminancia(corA);
  const b = luminancia(corB);
  const claro = Math.max(a, b);
  const escuro = Math.min(a, b);
  return (claro + 0.05) / (escuro + 0.05);
}

// Valor guardado → texto para um campo de edição.
//
// `String(1234.56)` devolve "1234.56", com ponto decimal, que é o formato
// americano — num app em pt-BR isso convida o usuário a "corrigir" para
// "1.234,56", e era justamente essa correção que o parseFloat cru destruía.
// Mostrar já no formato que a pessoa reconhece tira o motivo de mexer.
// O parseMoedaBR lê os dois formatos de volta, então a ida é só apresentação.
//
// Zero vira string vazia de propósito: nesses campos ele significa "não
// preenchido" (sem alvo, sem limite, sem saldo inicial), e o placeholder
// comunica isso melhor que um "0" solto.
export function paraCampoMoeda(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
