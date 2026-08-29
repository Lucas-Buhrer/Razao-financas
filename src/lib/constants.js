// Constantes de domínio: categorias, bancos, cores e navegação.
import {
  Home, Receipt, Repeat, Target, BarChart3, PiggyBank, Wallet, HandCoins, Settings,
} from "lucide-react";

export const CATEGORIES = {
  receita: [
    { id: "salario", label: "Salário", color: "#1B5E4F" },
    { id: "freelance", label: "Freelance", color: "#2E7D63" },
    { id: "investimentos", label: "Investimentos", color: "#3E8E75" },
    { id: "outros_receita", label: "Outros", color: "#6FA88F" },
  ],
  despesa: [
    { id: "moradia", label: "Moradia", color: "#A83B2E" },
    { id: "alimentacao", label: "Alimentação", color: "#B8562A" },
    { id: "transporte", label: "Transporte", color: "#C17A3A" },
    { id: "saude", label: "Saúde", color: "#9C4A56" },
    { id: "lazer", label: "Lazer", color: "#B8873A" },
    { id: "educacao", label: "Educação", color: "#7A6A9E" },
    { id: "assinaturas", label: "Assinaturas", color: "#8A5A7A" },
    { id: "outros_despesa", label: "Outros", color: "#9A8A7A" },
  ],
};

export const DEFAULT_BANKS = [
  { id: "carteira", label: "Carteira", color: "#6B5B3E", initialBalance: 0 },
  { id: "conta_corrente", label: "Conta Corrente", color: "#4A6FA5", initialBalance: 0 },
  { id: "poupanca", label: "Poupança", color: "#3A7A8C", initialBalance: 0 },
  { id: "cartao_credito", label: "Cartão de Crédito", color: "#7A6A9E", initialBalance: 0, kind: "cartao" },
];

export const NAV_ITEMS = [
  { id: "visao-geral", label: "Visão Geral", icon: Home, ready: true },
  { id: "lancamentos", label: "Lançamentos", icon: Receipt, ready: true },
  { id: "fixas", label: "Contas Fixas", icon: Repeat, ready: true },
  { id: "poupanca", label: "Caixinhas", icon: PiggyBank, ready: true },
  { id: "carteira", label: "Contas e Cartões", icon: Wallet, ready: true },
  { id: "orcamento", label: "Orçamento", icon: Target, ready: true },
  { id: "dividas", label: "Dívidas", icon: HandCoins, ready: true },
  { id: "relatorios", label: "Relatórios", icon: BarChart3, ready: true },
  { id: "config", label: "Configurações", icon: Settings, ready: true },
];

export const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export const COLOR_PALETTE = [
  "#1B5E4F", "#2E7D63", "#3E8E75", "#6FA88F", "#4A6FA5", "#3A7A8C",
  "#A83B2E", "#B8562A", "#C17A3A", "#9C4A56", "#B8873A", "#7A6A9E", "#8A5A7A", "#6B5B3E",
];

export const DEFAULT_SAVINGS_SEED = [
  { label: "Reserva de Emergência", color: "#1B5E4F" },
  { label: "Investimentos", color: "#4A6FA5" },
  { label: "Viagem", color: "#B8873A" },
  { label: "Aposentadoria", color: "#7A6A9E" },
];



export const DEFAULT_THEME = { paper: "#eef1e7", ink: "#1e2b23", emerald: "#1b5e4f", brick: "#a83b2e", gold: "#b8873a" };
export const THEME_PRESETS = [
  { name: "Razão Clássico", colors: DEFAULT_THEME },
  { name: "Noturno Azul", colors: { paper: "#e8edf2", ink: "#16202b", emerald: "#2a5c8a", brick: "#a8453a", gold: "#b6893e" } },
  { name: "Vinho", colors: { paper: "#f3eae5", ink: "#2b1a18", emerald: "#5f6b35", brick: "#7a2e3a", gold: "#b8873a" } },
  { name: "Ardósia", colors: { paper: "#eceef0", ink: "#20262b", emerald: "#3a7a6e", brick: "#a14a3c", gold: "#a68a4a" } },
  { name: "Escuro", colors: { paper: "#161b19", ink: "#e6ece7", emerald: "#4fae8f", brick: "#d97764", gold: "#d4a95c" } },
  { name: "Escuro Azul", colors: { paper: "#141a21", ink: "#e4ebf2", emerald: "#5b9bd1", brick: "#d9776a", gold: "#d3aa60" } },
];

export const FIXED_STATUS_LABEL = { lancada: "Lançada", vencendo: "Vence em breve", atrasada: "Atrasada", a_vencer: "A vencer" };
export const FIXED_STATUS_CLASS = { lancada: "rz-stamp-pago", vencendo: "rz-stamp-pendente", atrasada: "rz-stamp-atrasada", a_vencer: "rz-stamp-neutro" };

// `date` é a data do lançamento (quando a conta é de fato); `paymentDate` é o dia
// em que o dinheiro saiu/entrou. Só faz sentido quando o status é "pago" — em
// lançamentos pendentes ela fica vazia.
export const emptyForm = { description: "", amount: "", date: new Date().toISOString().slice(0, 10), paymentDate: new Date().toISOString().slice(0, 10), type: "despesa", category: "", account: "", toAccount: "", status: "pago", installments: false, installmentCount: "2", attachmentPath: null, attachmentName: "" };
export const emptyFixedForm = { description: "", amount: "", type: "despesa", category: "", account: "", dueDay: "5", frequency: "mensal", endPeriod: "", autoLaunch: false };
export const emptyDebtForm = { person: "", amount: "", direction: "emprestei", date: new Date().toISOString().slice(0, 10), dueDate: "", notes: "", interestRate: "" };
