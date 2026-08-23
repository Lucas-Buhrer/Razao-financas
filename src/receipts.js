import { supabase } from "./supabaseClient";
import { getHouseholdId } from "./storage";

const BUCKET = "comprovantes";

export async function uploadReceipt(file, transactionId) {
  const householdId = await getHouseholdId();
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const path = `${householdId}/${transactionId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
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
