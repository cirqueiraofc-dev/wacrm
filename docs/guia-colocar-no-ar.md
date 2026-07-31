# Guia: colocar o sistema no ar (do jeito certo, de graça)

Este guia leva o wacrm do zero até um site funcionando na internet, usando
**contas gratuitas**. É escrito para quem não é técnico — siga na ordem,
um passo de cada vez. Onde aparecer 🧑 é uma coisa que **só você pode fazer**
(criar conta, digitar senha); onde aparecer 🤖 é uma coisa que **o Claude
faz ou já preparou** para você.

## Como vamos dividir o trabalho

- 🧑 **Você**: cria as contas (exigem seu e-mail, sua senha e aceitar os
  termos — ninguém pode fazer isso no seu lugar) e cola os valores nos
  painéis.
- 🤖 **Claude**: prepara o código, gera as chaves de segurança, monta o
  banco de dados num arquivo só, te diz exatamente o que copiar e colar, e
  revisa cada etapa com você.

> ⚠️ **Segurança:** algumas chaves são secretas (a `service_role` do
> Supabase, a senha do banco, a `ENCRYPTION_KEY`). Guarde num lugar seguro
> e **nunca** as coloque dentro do código nem mande em print público. Você
> as cola apenas nos painéis (Supabase / Vercel), que são lugares seguros.

## O que cada serviço faz (visão geral)

| Serviço | Para que serve | Custo |
| --- | --- | --- |
| **GitHub** | Guarda o código | Grátis — ✅ você já tem (o projeto já está lá) |
| **Supabase** | Banco de dados + login dos usuários + armazenamento de arquivos | Grátis |
| **Vercel** | Hospeda o site (deixa ele no ar e atualiza sozinho) | Grátis |
| **Meta for Developers** | Conecta o WhatsApp (só pra função de WhatsApp) | Grátis |
| **Cloudflare** | Endereço próprio (ex.: `crm.seusite.com`) — opcional | Grátis |

Um sistema **completo e no ar** precisa dos 3 primeiros (GitHub, Supabase,
Vercel). WhatsApp e Cloudflare dá pra adicionar depois.

---

## Passo 1 — Supabase (banco, login e arquivos) 🧑

1. Acesse **supabase.com** e clique em **Start your project**.
2. Faça login **com o GitHub** (é o mais rápido, e você já tem GitHub).
3. Clique em **New project** e preencha:
   - **Name**: `wacrm` (ou o nome que quiser).
   - **Database Password**: crie uma senha forte e **guarde** — é a senha
     do banco de dados.
   - **Region**: escolha **South America (São Paulo)** (mais perto = mais
     rápido no Brasil).
4. Clique em **Create new project** e espere ~2 minutos ele ficar pronto.

### 1a. Criar as tabelas do banco 🤖→🧑

O Claude gerou **um único arquivo** com todo o banco de dados pronto
(`supabase_setup_completo.sql` — juntando as 36 partes na ordem certa).
Você só precisa colá-lo uma vez:

1. No Supabase, menu lateral → **SQL Editor** → **New query**.
2. Cole **todo** o conteúdo do arquivo.
3. Clique em **Run** (ou `Ctrl+Enter`). Deve aparecer **Success**.

> Se algum dia mudar o banco, o Claude gera um arquivo novo pra você.

### 1b. Copiar os 3 valores do Supabase 🧑

Menu lateral → **Project Settings** (engrenagem) → **API**. Copie:

- **Project URL** → vira `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** (chave) → vira `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role** (chave secreta) → vira `SUPABASE_SERVICE_ROLE_KEY` 🔒

Guarde esses 3. Você vai colá-los no Passo 2.

---

## Passo 2 — Vercel (colocar o site no ar) 🧑

1. Acesse **vercel.com** → **Sign up** → login **com o GitHub**.
2. **Add New… → Project** → **Import** no repositório `wacrm`.
3. A Vercel reconhece que é **Next.js** sozinha — não mexa nas
   configurações de build.
4. Abra **Environment Variables** e adicione (nome → valor):

   | Nome | Valor |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | (o Project URL do Passo 1b) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (a chave anon do Passo 1b) |
   | `SUPABASE_SERVICE_ROLE_KEY` | (a chave service_role — secreta) 🔒 |
   | `ENCRYPTION_KEY` | (a chave que o Claude te passou no chat) 🔒 |
   | `META_APP_SECRET` | por enquanto pode pôr `temporario` e trocar no Passo 3 |

5. Clique em **Deploy** e espere. Ao terminar, você recebe um endereço tipo
   `https://wacrm-xxxx.vercel.app` — **seu site no ar!** 🎉

> **Sobre o plano grátis da Vercel:** o plano **Hobby** é gratuito, porém
> para uso **não comercial**. Se este CRM for de uma empresa/cliente pagante,
> o correto é o plano **Pro** (pago) — ou uma alternativa grátis (Netlify,
> Render, ou Cloudflare Pages com um ajuste extra). Me avise o caso e eu
> indico o melhor caminho.

---

## Passo 3 — WhatsApp (Meta) 🧑 — quando quiser ativar

Só é preciso quando você for usar a parte de WhatsApp de verdade.

1. Acesse **developers.facebook.com** → **My Apps** → **Create App**.
2. Adicione o produto **WhatsApp**.
3. Em **App Settings → Basic**, copie o **App Secret** → atualize a
   variável `META_APP_SECRET` na Vercel (e opcional `META_APP_ID`).
4. Configure o **Webhook** apontando para:
   `https://SEU-SITE.vercel.app/api/whatsapp/webhook`
5. Dentro do sistema, em **Configurações → WhatsApp**, cole o token e o
   número. (Eu te acompanho nessa parte quando chegarmos nela.)

---

## Passo 4 — Endereço próprio via Cloudflare 🧑 — opcional

Quando quiser trocar o `...vercel.app` por algo como `crm.seusite.com`:

1. Registre um domínio (ou traga um que já tem) e crie conta na
   **cloudflare.com** (grátis) para gerenciar o DNS.
2. Na Vercel: **Project → Settings → Domains** → adicione seu domínio; a
   Vercel mostra quais registros criar na Cloudflare.
3. Copie esses registros na Cloudflare. Em minutos o endereço novo funciona,
   já com HTTPS.

---

## Ordem recomendada

1. ✅ **GitHub** — já feito.
2. **Supabase** (Passo 1) — banco no ar.
3. **Vercel** (Passo 2) — site no ar.
4. Testar: abrir o site, **criar sua conta** e entrar.
5. **WhatsApp** (Passo 3) e **domínio** (Passo 4) quando quiser.

## Onde eu entro em cada passo

- Já **gerei** a `ENCRYPTION_KEY` e o arquivo único do banco de dados.
- Quando você criar o Supabase e me passar o **Project URL** e a **anon key**
  (essas duas podem aparecer no chat; a `service_role` e senhas **não** —
  essas você guarda), eu confirmo a configuração e reviso tudo.
- Qualquer erro que aparecer, me manda o texto do erro que eu resolvo.

**Próximo passo agora:** faça o **Passo 1** (criar o Supabase). Me avise
quando o projeto estiver criado que seguimos juntos daí. 🚀
