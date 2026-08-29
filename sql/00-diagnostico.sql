-- =====================================================================
-- 00 — Diagnóstico (só leitura, não altera nada)
--
-- O SQL Editor do Supabase mostra apenas o resultado da ÚLTIMA consulta
-- quando você roda um arquivo com várias. Por isso aqui é tudo uma
-- consulta só: ela devolve UMA célula de JSON com as cinco respostas.
--
-- Como usar: selecionar tudo, Run, clicar na célula do resultado e copiar.
-- =====================================================================

select jsonb_pretty(jsonb_build_object(

  -- 1) Como o convite é gerado e conferido, e quem pode remover membro.
  --    O que importa: tamanho do código, alfabeto, se expira, se é de
  --    uso único, e se a função exige sessão.
  'funcoes', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'nome', p.proname,
             'definicao', pg_get_functiondef(p.oid)
           ) order by p.proname), '[]'::jsonb)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('create_invite_code', 'join_household',
                        'remove_household_member', 'get_my_household_id')
  ),

  -- 2) As políticas de RLS que estão valendo. Inclui storage.objects —
  --    é o que diz se um logado de outra família baixa comprovante seu.
  'policies', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'schema', schemaname, 'tabela', tablename, 'policy', policyname,
             'papeis', roles, 'cmd', cmd, 'using', qual, 'with_check', with_check
           ) order by schemaname, tablename, policyname), '[]'::jsonb)
    from pg_policies
    where schemaname in ('public', 'storage')
  ),

  -- 3) Tabelas com RLS desligado. Deve vir lista vazia.
  'tabelas_sem_rls', (
    select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  ),

  -- 4) Nomes reais das colunas (o próprio 05 avisa que podem diferir) e
  --    se já existe alguma noção de "dono" da família.
  'colunas', (
    select coalesce(jsonb_object_agg(tabela, cols), '{}'::jsonb)
    from (
      select table_name as tabela,
             jsonb_agg(column_name || ' ' || data_type order by ordinal_position) as cols
      from information_schema.columns
      where table_schema = 'public'
        and table_name in ('households', 'household_members',
                           'household_invites', 'user_data')
      group by table_name
    ) t
  ),

  -- 5) Quem pode executar o quê. Depois do 06, `anon` deve ser sempre false.
  'permissoes_rpc', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'funcao', p.proname,
             'anon', has_function_privilege('anon', p.oid, 'execute'),
             'logado', has_function_privilege('authenticated', p.oid, 'execute'),
             'security_definer', p.prosecdef
           ) order by p.proname), '[]'::jsonb)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname not like 'pg\_%'
  )

)) as diagnostico;
