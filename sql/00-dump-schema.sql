-- =====================================================================
-- 00b — Dump do schema que está no ar (só leitura)
--
-- Serve para reconstruir os arquivos 01..04, que não existem em lugar
-- nenhum: hoje, se o projeto Supabase se perder, não há como remontar o
-- banco. O diagnóstico anterior trouxe colunas, políticas e funções; falta
-- o resto do que define a estrutura — valores padrão, chaves, restrições,
-- índices e gatilhos.
--
-- Uma consulta só, um JSON só. Selecionar tudo, Run, copiar a célula.
-- =====================================================================

select jsonb_pretty(jsonb_build_object(

  -- Colunas com valor padrão e obrigatoriedade. É aqui que se descobre,
  -- por exemplo, se `household_invites.expires_at` tinha um DEFAULT — a
  -- função antiga de criar convite nunca preenchia esse campo.
  'colunas', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'tabela', table_name, 'coluna', column_name, 'tipo', data_type,
             'default', column_default, 'aceita_nulo', is_nullable
           ) order by table_name, ordinal_position), '[]'::jsonb)
    from information_schema.columns
    where table_schema = 'public'
  ),

  -- Chaves primárias, estrangeiras, unicidade e checks — com o texto
  -- exato da definição, que é o que dá para colar de volta num arquivo.
  'restricoes', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'tabela', rel.relname,
             'nome', con.conname,
             'tipo', case con.contype
                       when 'p' then 'primary key'
                       when 'f' then 'foreign key'
                       when 'u' then 'unique'
                       when 'c' then 'check'
                       else con.contype::text end,
             'definicao', pg_get_constraintdef(con.oid)
           ) order by rel.relname, con.conname), '[]'::jsonb)
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
  ),

  -- Índices (fora os que vêm de graça com as constraints acima).
  'indices', (
    select coalesce(jsonb_agg(indexdef order by tablename, indexname), '[]'::jsonb)
    from pg_indexes where schemaname = 'public'
  ),

  -- Gatilhos: é assim que uma conta nova ganha família automaticamente.
  -- Sem isto no arquivo, um projeto recriado do zero deixaria todo mundo
  -- sem household — e o app inteiro pararia de gravar.
  'gatilhos', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'nome', tgname,
             'tabela', c.relname,
             'schema', n.nspname,
             'definicao', pg_get_triggerdef(t.oid)
           ) order by tgname), '[]'::jsonb)
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal
      and n.nspname in ('public', 'auth')
  ),

  -- As funções que ainda não vi por inteiro.
  'funcoes_restantes', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'nome', p.proname, 'definicao', pg_get_functiondef(p.oid)
           ) order by p.proname), '[]'::jsonb)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('handle_new_user_household', 'leave_household',
                        'delete_my_account', 'revoke_invite_code',
                        'list_invite_codes')
  ),

  -- Quantas linhas existem hoje, para eu saber se algum passo mexeu em
  -- volume de dado sem querer. Não traz conteúdo nenhum.
  'contagens', (
    select jsonb_build_object(
      'user_data',         (select count(*) from public.user_data),
      'households',        (select count(*) from public.households),
      'household_members', (select count(*) from public.household_members),
      'household_invites', (select count(*) from public.household_invites)
    )
  )

)) as dump;
