# Razão — Controle Financeiro (com login)

Versão do app "Razão" adaptada para rodar como um site de verdade, com
login/senha reais (via Supabase Auth) e os dados salvos num banco de dados
na nuvem em vez do armazenamento local dos artifacts do Claude.

## O que já está pronto

- Tela de login e cadastro (e-mail + senha)
- Cada usuário só enxerga os próprios dados (Row Level Security no banco)
- Todo o app (Lançamentos, Categorias, Contas Fixas, Orçamento, Metas,
  Relatórios, Configurações/Tema) — sem nenhuma funcionalidade removida
- Botão "Sair da conta" na barra lateral


  components/Auth.jsx    -> tela de login/cadastro
  index.css              -> estilos (extraídos do App.jsx original)
supabase-schema.sql       -> script para criar a tabela e as permissões no banco
```
