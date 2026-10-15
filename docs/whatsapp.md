# WhatsApp: avisos internos

Avisos entre colaboradores pelo WhatsApp (ex.: "Relatório do fechamento pronto para revisão").
Sem disparo em massa, sem importar listas e sem envio automático: todo aviso nasce como
rascunho e só sai depois que um responsável confirma.

## 1. Decisão: qual modalidade

| | API alternativa (Evolution + Baileys) | API oficial da Meta (WhatsApp Cloud API) |
|---|---|---|
| O que é | Simula o WhatsApp Web num servidor seu. **Não é oficial.** | API da própria Meta |
| Como conecta | QR Code lido pelo celular do número | Conta Business verificada + número dedicado |
| Custo | Servidor (~R$ 30–60/mês) | Cobrança por conversa, pela Meta |
| Mensagens | Texto livre | Fora da janela de 24 h, só modelos aprovados |
| Risco | A Meta pode bloquear números com uso abusivo; quebra quando o WhatsApp Web muda | Suporte e estabilidade da Meta |
| Suporte | Comunidade (Evolution Foundation) | Meta |

**Escolhida agora (14/10/2026, Rodrigo):** Evolution API **v2.3.7** com Baileys, só para avisos
internos a números autorizados. A tela já mostra a API oficial como "Em breve": a camada
`src/lib/whatsapp-api/` tem as mesmas operações para qualquer provedor (`consultarConexao`,
`conectar`, `configurarEventos`, `enviarMensagem`), e cada conexão guarda o provedor, então
dá para cada empresa escolher depois, como na Cardápio Web.

## 2. Arquitetura

```
Navegador ──(login)──▶ App na Vercel (Next.js) ──apikey──▶ Evolution (seu servidor, Docker)
                          │   ▲                                  │
                          │   └──── webhook + JWT ◀──────────────┘
                          ▼
                       Supabase (conexões, destinatários, avisos, eventos)
```

- O navegador **nunca** recebe a chave da Evolution. Toda chamada sai do servidor do app.
- Uma conexão por empresa ou por unidade. O nome da instância é gerado pelo banco
  (`ao-<aleatório>`); ninguém digita, então uma empresa não alcança a instância de outra.
- O QR Code vai do servidor direto para a tela de quem gerencia, expira em 40 s e não é
  gravado em banco nem log. Quem não tem acesso à unidade da conexão não vê a conexão nem o QR.
- **Fila:** confirmar muda o aviso para "na fila" e o envio roda depois da resposta (`after()`).
  O cron diário e o botão "Processar fila agora" são a rede de segurança.
- **Webhook:** `POST /api/whatsapp/webhook/<id da conexão>`. A Evolution 2.3.7 não assina o
  corpo (não existe HMAC). O mecanismo que ela tem: com `jwt_key` nos headers do webhook, ela
  manda `Authorization: Bearer <JWT HS256>` válido por 10 min. O app confere esse JWT com
  `WHATSAPP_WEBHOOK_SECRET`, confere se a instância do corpo é a da conexão da URL, aceita só
  4 tipos (`connection.update`, `messages.update`, `messages.upsert`, `send.message`) e até
  256 KB, grava uma vez só (id externo + conexão) e processa depois.

### Estados de um aviso

`Rascunho → Confirmado/na fila → Aceito pelo provedor → Entregue → Lido`, ou `Falhou`,
ou `Resultado desconhecido`. Cada etapa só é preenchida com evidência: "aceito" = a Evolution
devolveu o id; "entregue/lido" = recibo do WhatsApp pelo webhook.

- Mesmo formulário enviado 2x: a chave `pedido_id` impede o segundo rascunho.
- Confirmar 2x: o segundo é recusado. Três processos tentando enviar ao mesmo tempo: só um pega.
- Sem conexão com a Evolution (recusada/DNS): tenta de novo até 3 vezes (30 s, 60 s, 120 s).
- **Timeout ou erro 5xx: vira "Resultado desconhecido" e nunca é reenviado sozinho.** Na tela,
  "Verificar no WhatsApp" pergunta à Evolution se a mensagem saiu (busca pelas mensagens
  enviadas no horário); se achou, marca como aceito sem reenviar. Senão, a pessoa escolhe
  Reenviar, Chegou ou Falha.
- Mensagens próprias e respostas recebidas são registradas como "ignoradas": o app não responde
  nada sozinho, então não há ciclo.

### Permissões

- `whatsapp.gerenciar` (perfil Gestor e dono): conectar número, autorizar destinatários,
  confirmar envios, ver eventos, criar regras.
- `whatsapp.avisos`: preparar rascunhos. Não confirma, não vê eventos, não mexe na conexão.

## 3. O que é seu fazer (uma vez)

1. **Aplicar o banco:** `git pull origin main` e `npx supabase db push` (migration 23).
2. **Contratar um servidor** com Docker (1 vCPU, 1–2 GB de RAM basta). Opções:
   - VPS simples: Hostinger, Contabo, Hetzner, DigitalOcean (~R$ 30–60/mês);
   - Painel pronto (Easypanel/Coolify) em cima da VPS, se preferir clicar em vez de terminal.
   A Vercel não serve: a Evolution precisa ficar ligada o tempo todo, com disco.
3. **Apontar um subdomínio** (ex.: `evolution.seudominio.com.br`) para o IP do servidor.
4. No servidor, com `docs/evolution/docker-compose.yml` e `docs/evolution/.env.example`
   (renomeado para `.env` e preenchido lá, nunca no Git): `docker compose up -d`.
   Teste: `https://evolution.seudominio.com.br` deve responder.
5. **Na Vercel** (Settings > Environment Variables), cadastre e faça Redeploy:
   - `EVOLUTION_API_URL` = `https://evolution.seudominio.com.br`
   - `EVOLUTION_API_KEY` = a mesma `AUTHENTICATION_API_KEY` do servidor
   - `WHATSAPP_WEBHOOK_SECRET` = outro texto aleatório com 32+ caracteres
   Para gerar textos aleatórios: `openssl rand -hex 32`.

Se você já tem uma Evolution rodando, pule 2–4: o app cria a própria instância com nome novo
e não mexe nas que já existem.

## 4. Testar

**Ensaio (sem servidor, dados fictícios):** WhatsApp > Conexão > "Criar ensaio" > Conectar
ensaio > Liberar envios. Em Destinatários, autorize um contato fictício. Em Avisos, "Usar texto
de teste", Salvar rascunho, Confirmar. O aviso passa por aceito, entregue e lido, e em Eventos
aparece um recibo duplicado contado. Destinatário com final `0000` simula timeout; `9999`, recusa.

**Real (um único número autorizado):**
1. Conexão > API alternativa > Conectar via API > Conectar > ler o QR com o celular que vai
   enviar. O status muda para Conectado (pelo webhook) ou clique "Atualizar status".
2. Destinatários: autorize **só o seu número** de teste.
3. Avisos: texto de teste > Salvar rascunho > Liberar envios na Conexão > Confirmar e enviar.
4. Confira no celular e na tela (Aceito → Entregue → Lido) e em Eventos.

**Regra do fechamento:** Destinatários > Avisos automáticos de check-list: escolha o check-list
(ex.: Fechamento) e quem avisar. Cada envio desse check-list cria um rascunho "pronto para
revisão" com o link do relatório; alguém confirma em Avisos.

## 5. Atualizar e recuperar

- **Atualizar a Evolution:** leia o CHANGELOG da versão nova, troque a tag no compose
  (`evoapicloud/evolution-api:vX.Y.Z`), `docker compose pull && docker compose up -d`. Confira
  no código da versão nova se os endpoints da seção 2 mudaram antes de trocar.
- **Backup:** banco do app = backup do Supabase. No servidor da Evolution, guarde em local
  privado o dump do Postgres dela (`docker compose exec postgres pg_dump -U evolution evolution`)
  e o volume `evolution_instances` (sessão do WhatsApp). O `.env` do servidor vai para um cofre
  de senhas, não para o backup comum.
- **Restaurar:** suba o compose num servidor novo com o mesmo `.env`, restaure o dump e o volume,
  aponte o subdomínio. Se a sessão não voltar, é só "Reconectar" e ler o QR: avisos, eventos e
  destinatários ficam no Supabase e não se perdem.
- **Trocar a chave:** gere outra `AUTHENTICATION_API_KEY`, atualize servidor e Vercel juntos.
  Trocar `WHATSAPP_WEBHOOK_SECRET`: atualize na Vercel e clique "Reconectar" (reconfigura o webhook).

## 6. Automações (envio sem confirmar)

Aba **Automações** (só quem gerencia). Tudo começa desligado.

- **Tarefa atribuída:** quando alguém recebe uma tarefa (nova ou trocando o responsável), sai uma
  mensagem com título, prazo, unidade, quem atribuiu e o link. Ficam de fora a rotina de check-list
  e de ação recorrente (vão no resumo), tarefa privada, tarefa já concluída e quem atribui a si mesmo.
  Feito no banco: gatilho `whatsapp_tarefa_atribuida` em `tarefas` (migration 24).
- **Resumo do dia:** no horário escolhido (fuso da empresa), uma mensagem por pessoa com o turno de
  hoje, as tarefas que vencem hoje e as atrasadas. Quem não tem nada no dia não recebe. Se o relógio
  atrasar mais de 3 h, o resumo do dia é pulado. Código: `src/lib/whatsapp-api/automacoes.ts`.
- **Tarefa concluída:** quem criou a tarefa recebe uma mensagem com quem concluiu e quando. Fica de
  fora tarefa privada, quem concluiu a própria tarefa e check-list (tem aviso próprio). Gatilho
  `whatsapp_tarefa_concluida` (migration 25).
- **Check-list concluído:** as regras "Avisos automáticos de check-list" (aba Destinatários) passam a
  enviar sozinhas, com quem enviou e os itens "Não". Desligado, viram rascunho como antes.
- **Lembrete de check-list:** `lembrete_minutos` antes do horário (cadastro do check-list, padrão 30,
  0 = sem), o responsável recebe um aviso para puxar a equipe. Feito pelo relógio; não manda depois
  que o horário passou. Todo check-list exige responsável; "Recebe o resultado" (também no cadastro)
  recebe o aviso de conclusão junto com as regras da aba Destinatários (migration 26).
- **Boas-vindas:** ao autorizar um destinatário, ele recebe uma apresentação pedindo para salvar o
  número. Uma vez só por destinatário (reativar não repete).
- **Quem recebe:** só destinatários autorizados **ligados a um colaborador**. O botão "Autorizar a
  equipe" cria os destinatários a partir do telefone do cadastro de cada colaborador.
- **Proteções:** limite diário de envios automáticos por conexão (passou, vira rascunho na aba
  Avisos); 3 a 7 s entre uma mensagem e outra; "Pausar envios" segura tudo; a mesma tarefa ou resumo
  nunca sai duas vezes (coluna `chave`). Tarefas privadas aparecem no resumo só como contagem.

### Relógio (obrigatório para as automações)

O cron da Vercel Hobby roda 1x por dia, então o servidor da Evolution chama o app a cada minuto.
No servidor (SSH), rode `crontab -e` e acrescente a linha (troque o segredo pelo valor de
`CRON_SECRET` da Vercel):

```
* * * * * curl -s -m 70 -H "Authorization: Bearer SEU_CRON_SECRET" https://assistente-operacional-eta.vercel.app/api/cron/whatsapp > /dev/null
```

Cada chamada gera os resumos na hora certa e envia até 12 mensagens da fila, espaçadas.

## 7. Limites conhecidos

- Baileys não é oficial: pode parar quando o WhatsApp Web muda, e a Meta pode bloquear números
  com comportamento de spam. Use um número da empresa, poucos avisos e só para quem autorizou.
- Sem resposta automática, sem mídia, sem grupos, sem agendamento nesta fase (agendamentos
  ficam pausados até você escolher horário, fuso, público e conteúdo).
- Na Vercel Hobby o cron roda 1x por dia; o envio confirmado na tela não depende dele (`after()`),
  mas as automações dependem do relógio do servidor (seção 6).
- "Verificar no WhatsApp" depende da Evolution guardar mensagens (`DATABASE_SAVE_DATA_NEW_MESSAGE`,
  ligado por padrão).

## 8. Fontes consultadas

- Código da Evolution v2.3.7 (github.com/evolution-foundation/evolution-api, `package.json` 2.3.7):
  `src/api/routes/instance.router.ts`, `src/api/controllers/instance.controller.ts`,
  `src/api/integrations/event/webhook/webhook.controller.ts` (jwt_key, retentativas, payload),
  `src/api/integrations/event/webhook/webhook.schema.ts`, `src/api/dto/sendMessage.dto.ts`,
  `src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts`, `src/utils/renderStatus.ts`,
  `.env.example`, `docker-compose.yaml`.
- docs.evolutionfoundation.com.br (create-instance, connect-instance, get-connection-state,
  set-webhook, send-text-message). Atenção: as páginas de set-webhook e send-text-message
  descrevem payloads diferentes do código 2.3.7 (`textMessage.text` e campos soltos); o app
  segue o código da versão fixada (`text` e `webhook: {…}`).
- Docker Hub `evoapicloud/evolution-api`: tag `v2.3.7` (05/12/2025) é a última estável; a 2.4.0
  ainda está em RC.
