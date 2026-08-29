-- =====================================================================
-- 09 — Entrar numa família passa a MESCLAR de verdade
--
-- Rode depois do 07. Substitui de novo o join_household.
--
-- O ERRO
-- ------
--   duplicate key value violates unique constraint
--   "user_data_household_id_key_key"
--
-- A tabela user_data tem UNIQUE (household_id, key) — uma linha por
-- chave, por família. E o join_household (tanto o original quanto a
-- minha versão do 07) fazia:
--
--   update user_data set household_id = destino where household_id = ...
--
-- Ou seja: mudava a etiqueta da família e pronto. Se as duas famílias já
-- tinham a chave `lancamentos` — e têm, bastando as duas pessoas terem
-- aberto o app uma vez —, a mudança criava duas linhas
-- (destino, 'lancamentos') e o banco recusava.
--
-- Nunca foi mesclagem, era mudança de etiqueta. Só funcionava quando
-- quem entrava chegava com a conta em branco. A tela promete "unir os
-- dados que você já tem aos dados da família do código informado", e é
-- isso que passa a acontecer.
--
-- COMO A MESCLAGEM FUNCIONA
-- -------------------------
-- Chave por chave, comparando o que você traz com o que a família de
-- destino já tem:
--
--   só existe do seu lado          → a linha muda de família
--   os dois lados são lista JSON   → junta as duas listas
--   qualquer outro caso            → fica o valor da família de destino
--
-- A terceira regra vale para configuração: tema, ordem de categorias,
-- filtros. Não faz sentido somar duas ordens de categoria — a casa em
-- que você está entrando é que manda.
--
-- Ao juntar listas, elementos com o mesmo `id` entram uma vez só, e a
-- versão da família de destino é a que fica. Os itens dela vêm primeiro,
-- na ordem original, e os seus em seguida.
-- =====================================================================

create or replace function public.join_household(invite_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  eu uuid := auth.uid();
  destino uuid;
  minha_antiga uuid;
  meu_email text;
  membros_na_antiga int;
  codigo text := upper(trim(invite_code));
  reg record;
  valor_deles text;
  json_meu jsonb;
  json_deles jsonb;
  json_novo jsonb;
begin
  if eu is null then
    raise exception 'Sessão inválida.';
  end if;

  select household_id into destino
  from public.household_invites
  where code = codigo
    and used_by is null
    and expires_at > now();

  if destino is null then
    raise exception 'Código inválido ou expirado.';
  end if;

  select household_id into minha_antiga
  from public.household_members
  where user_id = eu;

  if minha_antiga = destino then
    raise exception 'Você já faz parte desta família.';
  end if;

  select count(*) into membros_na_antiga
  from public.household_members
  where household_id = minha_antiga;

  select u.email into meu_email from auth.users u where u.id = eu;

  -- Os dados só vêm junto se a família de origem for só sua. Havendo mais
  -- alguém lá, eles ficam onde estão: não são seus para levar.
  if minha_antiga is not null and membros_na_antiga = 1 then

    for reg in
      select key, value from public.user_data where household_id = minha_antiga
    loop
      select ud.value into valor_deles
      from public.user_data ud
      where ud.household_id = destino and ud.key = reg.key;

      if not found then
        -- Chave que só existe do meu lado: vai inteira.
        update public.user_data
           set household_id = destino
         where household_id = minha_antiga and key = reg.key;

      else
        -- Existe dos dois lados. Os dois são lista JSON?
        begin
          json_meu   := reg.value::jsonb;
          json_deles := valor_deles::jsonb;
        exception when others then
          -- Valor que não é JSON válido: trata como não-lista.
          json_meu := null;
          json_deles := null;
        end;

        if jsonb_typeof(json_meu) = 'array' and jsonb_typeof(json_deles) = 'array' then
          with juntos as (
            select 1 as fonte, ord, e
            from jsonb_array_elements(json_deles) with ordinality as t(e, ord)
            union all
            select 2 as fonte, ord, e
            from jsonb_array_elements(json_meu) with ordinality as t(e, ord)
          ),
          unicos as (
            -- Um item por id. Empatando, fica o da família de destino
            -- (fonte 1). Itens sem id são comparados pelo conteúdo.
            select distinct on (coalesce(e ->> 'id', e::text)) fonte, ord, e
            from juntos
            order by coalesce(e ->> 'id', e::text), fonte, ord
          )
          select coalesce(jsonb_agg(e order by fonte, ord), '[]'::jsonb)
            into json_novo
          from unicos;

          update public.user_data
             set value = json_novo::text,
                 updated_at = now()
           where household_id = destino and key = reg.key;
        end if;

        -- Mesclada ou descartada, a linha antiga sai de cena.
        delete from public.user_data
         where household_id = minha_antiga and key = reg.key;
      end if;
    end loop;

    -- Rede de segurança: se sobrou alguma coisa, não pode ficar órfã
    -- apontando para uma família sem ninguém.
    delete from public.user_data where household_id = minha_antiga;
  end if;

  update public.household_members
     set household_id = destino,
         email = meu_email,
         role = 'member',
         joined_at = now()
   where user_id = eu;

  update public.household_invites
     set used_by = eu, used_at = now()
   where code = codigo and used_by is null;
end;
$$;

revoke all on function public.join_household(text) from public, anon;
grant execute on function public.join_household(text) to authenticated;
