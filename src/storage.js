import { supabase } from "./supabaseClient";

// Este arquivo replica a mesma API do "window.storage" usada nos artifacts do
// Claude (get/set/delete/list), mas agora gravando de verdade no Supabase,
// numa tabela única de chave/valor (user_data), isolada por usuário via RLS.
// Isso permite reaproveitar o App.jsx quase sem alterações.

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado.");
  return user.id;
}

export const storage = {
  async get(key) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from("user_data")
      .select("key, value")
      .eq("user_id", userId)
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { key: data.key, value: data.value };
  },

  async set(key, value) {
    const userId = await getUserId();
    const { error } = await supabase
      .from("user_data")
      .upsert({ user_id: userId, key, value, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
    if (error) throw error;
    return { key, value };
  },

  async delete(key) {
    const userId = await getUserId();
    const { error } = await supabase
      .from("user_data")
      .delete()
      .eq("user_id", userId)
      .eq("key", key);
    if (error) throw error;
    return { key, deleted: true };
  },

  async list(prefix = "") {
    const userId = await getUserId();
    let query = supabase.from("user_data").select("key").eq("user_id", userId);
    if (prefix) query = query.like("key", `${prefix}%`);
    const { data, error } = await query;
    if (error) throw error;
    return { keys: (data || []).map((r) => r.key), prefix };
  },
};
