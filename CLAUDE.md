# Assistente Operacional

- Responder e escrever textos de interface em português do Brasil.
- Next.js 15 App Router + Supabase. Server Components buscam dados; mutações em Server Actions (`actions.ts` ao lado da página).
- Regras de acesso ficam no banco: toda tabela de negócio tem `empresa_id` + RLS usando `eh_membro`, `tem_permissao`, `pode_acessar`. Nova permissão = inserir em `public.permissoes` numa migration nova.
- Nunca editar migrations já aplicadas; criar um arquivo novo em `supabase/migrations/`.
- Novas funções SQL nascem sem permissão de execução (default privileges); dar `grant execute` explícito.
- Todos os módulos usam a tabela única `tarefas` (campo `origem`) e o motor de recorrência em `src/lib/recorrencia.ts` + `src/lib/gerar-tarefas.ts`.
- `createAdminClient` (service_role) só para o que não tem login: central pública do QR, feed da agenda (`/agenda/<token>.ics`), o cron e o WhatsApp (webhook e fila em `src/lib/whatsapp-api/`).
- Datas: guardar em UTC, exibir com `formatarDataHora(iso, empresa.fuso_horario)`.
- Antes de commitar: `npx tsc --noEmit && npm run lint`.
- Visual (Apple HIG): cores só pelas classes `slate`/`blue`/`red`/`green` e `bg-superficie` (nunca `bg-white`); os tokens em `src/app/globals.css` trocam no modo escuro. Menu em `src/app/e/[empresaId]/menu-lateral.tsx`.
- Guia do usuário (`src/app/e/[empresaId]/guia/conteudo.ts`): toda mudança visível ou módulo novo atualiza a seção da tela no mesmo PR (seção nova para tela nova no menu). PR que não muda o guia diz por quê.
