# Assistente Operacional

App para delegar e acompanhar tarefas da operação: check-lists, chamados de manutenção,
escalas e alertas de datas, com avisos por WhatsApp e Google Agenda.

**Stack:** Next.js 15 (App Router) · Supabase (Postgres, Auth, Storage, RLS) · Vercel · Tailwind.

## O que já existe

- **Multi-empresa (multi-tenant).** Um login pode participar de várias empresas. O vínculo
  pessoa ↔ empresa fica em `membros` (cargo, perfil, setor, unidades).
- **Empresa > Unidade > Setor.** Empresa única = uma empresa com uma unidade. Setores valem
  para todas as unidades.
- **Perfis com caixinhas de permissão** e escopo (só as minhas / do meu setor / da minha
  unidade / da empresa toda). Já vêm 3 perfis prontos: Gerente, Líder de setor e Colaborador.
  O dono da empresa sempre tem acesso total.
- **Kanban único** para todos os módulos (tabela `tarefas` com campo `origem`). Status
  personalizáveis com tipo fixo por trás. Padrão: Solicitado, Em andamento, Concluído, Adiado
  e Cancelado. Adiar exige nova data e permite **retornar** ao status anterior. Todo movimento
  fica no histórico.
- **Check-list:** modelos com itens Sim/Não/Em processo/N/A, número ou texto, foto (opcional
  ou obrigatória quando "Não"), horário preferencial, tolerância e recorrência. Dois canais:
  - **App** (colaborador logado);
  - **QR Code da unidade** (sem login): a pessoa escolhe o nome e digita um PIN de 4 dígitos.
    5 erros de PIN bloqueiam por 15 minutos.
  "Salvar e enviar" grava no banco e depois abre o WhatsApp com o resumo e o link das fotos.
- **Recorrência (RRULE, o mesmo formato do Google Agenda):** um job diário cria no Kanban as
  tarefas dos check-lists de hoje e dos próximos 2 dias. Ao preencher, a tarefa do dia é
  concluída sozinha.
- **Convites:** cadastre o colaborador com e-mail; quando ele criar a conta com o mesmo e-mail,
  já entra vinculado à empresa.

Próximos módulos (já previstos no banco): ações recorrentes, chamados, alertas e escalas.

## Como colocar no ar

As contas e chaves são suas; nada disso fica no repositório.

### 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com) (região São Paulo).
2. Em **Authentication > URL Configuration**:
   - **Site URL:** o endereço do app na Vercel (ex.: `https://assistente-operacional.vercel.app`).
   - **Redirect URLs:** adicione `https://SEU-APP.vercel.app/auth/callback` e
     `http://localhost:3000/auth/callback`.
3. Deixe **Confirm email** ligado (Authentication > Sign In / Providers > Email). Os convites
   dependem do e-mail confirmado.
4. Aplique o banco (tabelas, RLS, funções e o bucket de fotos). No seu computador, na pasta
   do projeto:

   ```bash
   npm install
   npx supabase login
   npx supabase link --project-ref SEU_PROJECT_REF   # está na URL do painel do projeto
   npx supabase db push
   ```

   Alternativa sem CLI: cole cada arquivo de `supabase/migrations/` (em ordem) no
   **SQL Editor** do Supabase e execute.

5. Em **Project Settings > API**, copie a URL, a chave `anon` e a chave `service_role`.

### 2. Rodar no seu computador

```bash
cp .env.example .env.local   # preencha com os dados do passo 1.5
npm run dev
```

Abra http://localhost:3000, crie sua conta, confirme o e-mail e cadastre a empresa.

### 3. Vercel

1. Em [vercel.com](https://vercel.com) > **Add New > Project**, importe este repositório do GitHub.
2. Em **Environment Variables**, cadastre as mesmas variáveis do `.env.example`, com
   `NEXT_PUBLIC_SITE_URL` = endereço final do app (ex.: `https://assistente-operacional.vercel.app`).
3. Deploy. O cron diário (`vercel.json`) roda às 05:00 de Brasília e gera as tarefas
   recorrentes. Ele também roda na hora em que um check-list é salvo.

Depois do deploy, volte no Supabase e confira se a **Site URL** e o **Redirect URL** apontam
para o endereço da Vercel.

## Primeiros passos no app

1. **Configurações > Geral:** confira a unidade criada, adicione outras, setores e categorias.
2. **Configurações > Colaboradores:** cadastre a equipe. Com e-mail = acesso ao app. Com PIN =
   pode preencher pelo QR Code.
3. **Check-lists > Novo check-list:** monte os itens, horário e recorrência.
4. **Configurações > Geral > unidade > QR Code e detalhes:** imprima o QR e cole no local.

## Estrutura

```
supabase/migrations/   schema, RLS e funções (fonte da verdade das regras de acesso)
src/lib/               clientes Supabase, contexto de permissões, recorrência, WhatsApp
src/app/(auth)/        entrar e cadastrar
src/app/app/           escolher/criar empresa
src/app/e/[empresaId]/ área logada: tarefas (Kanban), check-lists, configurações
src/app/qr/[token]/    central pública de check-lists da unidade (QR Code)
src/app/api/cron/      job da recorrência (Vercel Cron)
```

As regras de segurança ficam no banco (RLS + funções `security definer`). As telas só
escondem o que a pessoa não pode usar; mesmo chamando a API direto, o banco recusa.

## Testando o banco localmente (opcional)

Com Docker instalado: `npx supabase start` sobe um Supabase local com as migrations aplicadas
(painel em http://127.0.0.1:54323). Use as chaves que o comando mostrar no `.env.local`.
