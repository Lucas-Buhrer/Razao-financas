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

## Passo a passo para colocar no ar (tudo gratuito)

### 1. Criar o projeto no Supabase

1. Crie uma conta em [supabase.com](https://supabase.com) (dá para entrar com GitHub)
2. Clique em **New Project**, escolha um nome e uma senha de banco (guarde essa senha)
3. Espere o projeto ser criado (leva ~2 minutos)

### 2. Criar a tabela no banco

1. No painel do projeto, vá em **SQL Editor** (menu lateral)
2. Clique em **New query**
3. Abra o arquivo `supabase-schema.sql` (está nesta pasta), copie todo o
   conteúdo, cole no editor e clique em **Run**
4. Isso cria a tabela `user_data` e já configura a segurança (cada usuário só
   vê os próprios dados)

### 3. Pegar suas chaves de API

1. No painel do Supabase, vá em **Project Settings** → **API**
2. Copie a **Project URL** e a chave **anon public**

### 4. Configurar o projeto localmente

```bash
# dentro da pasta do projeto
cp .env.example .env
```

Abra o `.env` e cole os valores que você copiou:

```
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-aqui
```

### 5. Instalar e testar localmente

```bash
npm install
npm run dev
```

Abra o endereço que aparecer no terminal (geralmente `http://localhost:5173`).
Crie sua conta pela tela de cadastro e teste o app.

> Por padrão o Supabase exige confirmação por e-mail no cadastro. Se quiser
> pular essa etapa enquanto testa, vá em **Authentication → Providers → Email**
> no painel do Supabase e desative "Confirm email" temporariamente.

### 6. Publicar no ar (Vercel, gratuito)

1. Crie uma conta em [vercel.com](https://vercel.com) (dá para entrar com GitHub)
2. Suba este projeto para um repositório no GitHub
3. No Vercel, clique em **Add New → Project** e selecione o repositório
4. Em **Environment Variables**, adicione as mesmas duas variáveis do `.env`
   (`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`)
5. Clique em **Deploy**

Pronto — seu app fica no ar num endereço tipo `seu-projeto.vercel.app`, com
login e senha reais, acessível de qualquer dispositivo.

## Estrutura do projeto

```
src/
  App.jsx              -> o sistema inteiro (mesma lógica de antes)
  storage.js            -> troca o "window.storage" dos artifacts por chamadas reais ao Supabase
  supabaseClient.js      -> conexão com o Supabase
  AppGate.jsx            -> decide entre mostrar a tela de login ou o app
  components/Auth.jsx    -> tela de login/cadastro
  index.css              -> estilos (extraídos do App.jsx original)
supabase-schema.sql       -> script para criar a tabela e as permissões no banco
```
