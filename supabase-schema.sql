-- Execute este script inteiro no SQL Editor do seu projeto Supabase
-- (painel do Supabase -> SQL Editor -> New query -> colar e rodar "Run")

create table if not exists public.user_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

create index if not exists user_data_user_id_idx on public.user_data (user_id);

-- Ativa Row Level Security: por padrão, ninguém acessa nada.
alter table public.user_data enable row level security;

-- Cada usuário só pode ler, criar, alterar e apagar as próprias linhas.
create policy "Usuários gerenciam apenas os próprios dados"
  on public.user_data
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
