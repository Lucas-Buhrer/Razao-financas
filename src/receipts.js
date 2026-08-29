import { supabase } from "./supabaseClient";
import { getHouseholdId } from "./storage";

const BUCKET = "comprovantes";

// Os mesmos limites que o bucket aplica no servidor (ver sql/08-storage.sql).
// Existem aqui só para o usuário receber um "esse arquivo tem 14 MB" em vez
// de um erro genérico depois de esperar o upload inteiro. Quem protege de
// verdade é o servidor — validação no cliente é conveniência, nunca defesa.
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

export const RECEIPT_MIME_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf",
];

const EXTENSOES_OK = ["jpg", "jpeg", "png", "webp", "heic", "heif", "pdf"];

// Devolve a mensagem do problema, ou null se o arquivo serve.
export function validarComprovante(file) {
  if (!file) return "Nenhum arquivo selecionado.";
  if (file.size === 0) return "Esse arquivo está vazio.";

  if (file.size > MAX_RECEIPT_BYTES) {
    // Arredonda para cima: com toFixed puro, um arquivo 1 byte acima do teto
    // virava a frase "tem 10.0 MB e o limite é 10 MB", que parece defeito.
    const mb = (Math.ceil((file.size / 1024 / 1024) * 10) / 10).toFixed(1);
    return `Esse arquivo tem ${mb} MB e o limite é 10 MB. Tente fotografar em qualidade menor.`;
  }

  // Alguns navegadores entregam type vazio para HEIC do iPhone — nesse caso
  // vale a extensão. Não dá para confiar em nenhum dos dois: o bucket é que
  // decide. Aqui só evita uma ida ao servidor que já se sabe perdida.
  const tipo = (file.type || "").toLowerCase();
  const ext = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
  const serve = tipo ? RECEIPT_MIME_TYPES.includes(tipo) : EXTENSOES_OK.includes(ext);

  if (!serve) return "Só dá para anexar foto (JPG, PNG, WebP, HEIC) ou PDF.";
  return null;
}

export async function uploadReceipt(file, transactionId) {
  const problema = validarComprovante(file);
  if (problema) throw new Error(problema);

  const householdId = await getHouseholdId();
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const path = `${householdId}/${transactionId}-${Date.now()}.${ext}`;

  // upsert:false de propósito. O caminho carrega Date.now(), então não colide
  // — e não existe policy de UPDATE em storage.objects, só INSERT, SELECT e
  // DELETE. Com upsert:true, o dia em que houvesse colisão o erro chegaria
  // como "violates row-level security policy", que não diz nada a quem está
  // tentando anexar um cupom.
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined });

  if (error) throw error;
  return path;
}

export async function getReceiptUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteReceipt(path) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
