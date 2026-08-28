-- =====================================================================
-- 05 — Extras de família: listar membros, sair, remover, revogar código
--      e excluir a própria conta.
--
-- Rode DEPOIS de 01-base.sql, 02-familia.sql, 03-familia-fix.sql.
--
-- ATENÇÃO AOS NOMES: este arquivo assume a tabela de convites chamada
-- `household_invites` com as colunas (code, household_id, created_by,
-- created_at, expires_at, used_at). Se o seu 02-familia.sql usou outro
-- nome — `invites`, `invite_codes` — troque nas funções abaixo antes de
-- rodar. Confira com:
--
--   select table_name, column_name from information_schema.columns
--   where table_schema = 'public' and column_name in ('code','invite_code');
--
-- E lembre da ARMADILHAS.md: o SQL Editor do Supabase ignora RLS. Depois
-- de rodar, TESTE PELO APP, não só aqui.
-- =====================================================================

-- Apelido do usuário (o app grava em user_metadata.display_name via
-- supabase.auth.updateUser). Esta função só lê.

-- ---------------------------------------------------------------------
-- 1) Quem está na minha família
-- ---------------------------------------------------------------------
create or replace function public.list_household_members()
returns table (
  user_id uuid,
  email text,
  display_name text,
  joined_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    hm.user_id,
    u.email::text,
    nullif(trim(coalesce(u.raw_user_meta_data ->> 'display_name', '')), '') as display_name,
    hm.created_at as joined_at
  from public.household_members hm
  join auth.users u on u.id = hm.user_id
  where hm.household_id = public.get_my_household_id()
  order by hm.created_at asc;
$$;

grant execute on function public.list_household_members() to authenticated;

-- ---------------------------------------------------------------------
-- 2) Códigos de convite ainda válidos
-- ---------------------------------------------------------------------
create or replace function public.list_invite_codes()
returns table (
  code text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select i.code::text, i.created_at, i.expires_at
  from public.household_invites i
  where i.household_id = public.get_my_household_id()
    and i.used_at is null
    and i.expires_at > now()
  order by i.created_at desc;
$$;

grant execute on function public.list_invite_codes() to authenticated;

-- ---------------------------------------------------------------------
-- 3) Revogar um código (mandou para a pessoa errada)
-- ---------------------------------------------------------------------
create or replace function public.revoke_invite_code(invite_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  afetados int;
begin
  update public.household_invites
     set expires_at = now() - interval '1 second'
   where code = upper(trim(invite_code))
     and household_id = public.get_my_household_id()
     and used_at is null;

  get diagnostics afetados = row_count;
  if afetados = 0 then
    raise exception 'Código não encontrado nesta família ou já utilizado.';
  end if;
end;
$$;

grant execute on function public.revoke_invite_code(text) to authenticated;

-- ---------------------------------------------------------------------
-- 4) Sair da família — ganha um espaço novo e vazio.
--    Os dados FICAM com a família de origem, de propósito: eles são de
--    todos, não só de quem está saindo. Quem quiser levar cópia baixa um
--    backup antes (a tela avisa isso).
-- ---------------------------------------------------------------------
create or replace function public.leave_household()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  atual uuid;
  novo uuid;
  restantes int;
begin
  atual := public.get_my_household_id();
  if atual is null then
    raise exception 'Você não pertence a nenhuma família.';
  end if;

  select count(*) into restantes
  from public.household_members
  where household_id = atual;

  if restantes <= 1 then
    raise exception 'Você é a única pessoa desta família — não há de quem se separar.';
  end if;

  insert into public.households default values returning id into novo;

  update public.household_members
     set household_id = novo
   where user_id = auth.uid();

  return novo;
end;
$$;

grant execute on function public.leave_household() to authenticated;

-- ---------------------------------------------------------------------
-- 5) Remover outra pessoa da família.
--    Não há papel de "dono" no modelo atual: a família é um grupo de
--    confiança, então qualquer membro pode remover outro — menos a si
--    mesmo (para isso existe leave_household).
-- ---------------------------------------------------------------------
create or replace function public.remove_household_member(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  atual uuid;
  novo uuid;
begin
  atual := public.get_my_household_id();

  if target_user_id = auth.uid() then
    raise exception 'Para sair você mesmo, use a opção "Sair da família".';
  end if;

  if not exists (
    select 1 from public.household_members
    where household_id = atual and user_id = target_user_id
  ) then
    raise exception 'Essa pessoa não está na sua família.';
  end if;

  -- A pessoa removida não pode ficar sem lugar nenhum: ganha um espaço
  -- próprio, vazio, para continuar usando o app.
  insert into public.households default values returning id into novo;

  update public.household_members
     set household_id = novo
   where user_id = target_user_id;
end;
$$;

grant execute on function public.remove_household_member(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6) Excluir a própria conta (LGPD).
--    Se for a última pessoa da família, os dados vão junto.
-- ---------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  atual uuid;
  restantes int;
  me uuid;
begin
  me := auth.uid();
  if me is null then
    raise exception 'Sessão inválida.';
  end if;

  atual := public.get_my_household_id();

  select count(*) into restantes
  from public.household_members
  where household_id = atual;

  delete from public.household_members where user_id = me;

  if restantes <= 1 then
    delete from public.user_data where household_id = atual;
    delete from public.household_invites where household_id = atual;
    delete from public.households where id = atual;
  end if;

  delete from auth.users where id = me;
end;
$$;

grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------
-- Teste rápido (rode PELO APP depois, não só aqui):
--   select * from public.list_household_members();
--   select * from public.list_invite_codes();
-- ---------------------------------------------------------------------
