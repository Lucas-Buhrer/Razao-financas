import { supabase } from "./supabaseClient";

// Este arquivo replica a mesma API do "window.storage" usada nos artifacts do
// Claude (get/set/delete/list), mas agora gravando de verdade no Supabase.
// Os dados são organizados por "família" (household) em vez de por usuário
// individual, para permitir o compartilhamento entre membros da família.

let cachedHouseholdId = null;
let cachedForUserId = null;

export async function getHouseholdId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado.");
  if (cachedHouseholdId && cachedForUserId === user.id) return cachedHouseholdId;

  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .single();
  if (error || !data) throw new Error("Não foi possível identificar sua família.");

  cachedHouseholdId = data.household_id;
  cachedForUserId = user.id;
  return cachedHouseholdId;
}

// Chame isso depois de entrar numa nova família (join_household) para que as
// próximas leituras/escritas já usem o household_id atualizado.
export function resetStorageCache() {
  cachedHouseholdId = null;
  cachedForUserId = null;
}

// Algumas preferências são de quem está usando, não da família inteira (o tema,
// por exemplo). Elas continuam na mesma tabela, mas com o id do usuário no fim
// da chave: "tema_cores@<uuid>". Assim cada membro tem a sua.
async function resolverChave(key, perUser) {
  if (!perUser) return key;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado.");
  return `${key}@${user.id}`;
}

export const storage = {
  async get(key, { perUser = false } = {}) {
    const householdId = await getHouseholdId();
    const chave = await resolverChave(key, perUser);
    const { data, error } = await supabase
      .from("user_data")
      .select("key, value")
      .eq("household_id", householdId)
      .eq("key", chave)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { key: data.key, value: data.value };
  },

  async set(key, value, { perUser = false } = {}) {
    const householdId = await getHouseholdId();
    const { data: { user } } = await supabase.auth.getUser();
    const chave = await resolverChave(key, perUser);
    const { error } = await supabase
      .from("user_data")
      .upsert(
        { household_id: householdId, user_id: user.id, key: chave, value, updated_at: new Date().toISOString() },
        { onConflict: "household_id,key" }
      );
    if (error) throw error;
    return { key: chave, value };
  },

  async delete(key, { perUser = false } = {}) {
    const householdId = await getHouseholdId();
    const chave = await resolverChave(key, perUser);
    const { error } = await supabase
      .from("user_data")
      .delete()
      .eq("household_id", householdId)
      .eq("key", chave);
    if (error) throw error;
    return { key: chave, deleted: true };
  },

  async list(prefix = "") {
    const householdId = await getHouseholdId();
    let query = supabase.from("user_data").select("key").eq("household_id", householdId);
    if (prefix) query = query.like("key", `${prefix}%`);
    const { data, error } = await query;
    if (error) throw error;
    return { keys: (data || []).map((r) => r.key), prefix };
  },
};
