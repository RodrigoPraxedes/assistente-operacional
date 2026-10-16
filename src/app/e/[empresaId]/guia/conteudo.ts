import {
  BookOpen,
  Bot,
  CalendarClock,
  CalendarDays,
  CalendarSync,
  ChartGantt,
  LayoutDashboard,
  ListChecks,
  MessageCircle,
  Repeat,
  Settings,
  SquareKanban,
  Wrench,
  type LucideIcon,
} from "lucide-react";

// Manual do usuário: um texto por seção do menu. Conteúdo fixo, igual para todos os perfis.
// Ao mudar o comportamento de uma tela, atualize a seção dela aqui.

export interface Topico {
  titulo: string;
  passos: string[];
}

export interface SecaoGuia {
  slug: string;
  titulo: string;
  icone: LucideIcon;
  resumo: string;
  // caminho da tela dentro da empresa (ex.: "/tarefas"); vazio = sem botão "Abrir"
  tela?: string;
  paraQue: string;
  topicos: Topico[];
  dicas?: string[];
}

export const SECOES: SecaoGuia[] = [
  {
    slug: "primeiros-passos",
    titulo: "Primeiros passos",
    icone: BookOpen,
    resumo: "A ordem para deixar a empresa pronta para usar.",
    paraQue:
      "Antes de distribuir tarefas, vale montar a base: unidades, setores, equipe e permissões. Esta é a ordem que dá menos retrabalho. Quem não é gestor pode pular para a seção da tela que usa no dia a dia.",
    topicos: [
      {
        titulo: "Montando a empresa (gestor)",
        passos: [
          "Configurações › Geral: confira o nome e o fuso horário da empresa, as unidades, os setores (Cozinha, Salão, Estoque...) e as categorias.",
          "Configurações › Colaboradores: cadastre a equipe com nome, cargo, WhatsApp, perfil, setor e unidades.",
          "Para quem vai entrar no app, preencha o e-mail. Para quem vai preencher check-list pelo QR Code, crie um PIN de 4 dígitos.",
          "Configurações › Perfis de acesso: confira o que cada perfil pode fazer (já vêm Gestor, Líder de setor e Colaborador).",
          "Check-lists: monte os check-lists da rotina com horário, responsável e repetição.",
          "Configurações › Geral › unidade › QR Code e detalhes: imprima o QR Code e cole no local de trabalho.",
          "Escalas: cadastre os turnos e monte a semana da equipe.",
          "WhatsApp: conecte um número e ligue as automações que quiser.",
        ],
      },
      {
        titulo: "No dia a dia",
        passos: [
          "Abra o Painel para ver o que está atrasado, o que vence hoje e quem está escalado.",
          "Acompanhe e mova as tarefas em Tarefas.",
          "Use o botão verde do WhatsApp nas tarefas para avisar o responsável na hora.",
        ],
      },
      {
        titulo: "Menu, tema e empresas",
        passos: [
          "No computador, o botão ao lado do logo recolhe o menu para mostrar só os ícones.",
          "No celular, o menu abre pelo botão ☰ no alto da tela.",
          "Embaixo do menu você escolhe o tema: claro, escuro ou automático (segue o aparelho).",
          "Quem participa de mais de uma empresa troca pelo link Trocar de empresa, logo abaixo do logo.",
        ],
      },
    ],
  },
  {
    slug: "painel",
    titulo: "Painel",
    icone: LayoutDashboard,
    resumo: "O resumo do dia: atrasos, check-lists, manutenções e escala.",
    tela: "/painel",
    paraQue:
      "É a tela de entrada. Mostra num só lugar o que pede atenção hoje. Cada pessoa vê só o que tem permissão para ver, inclusive nas tarefas privadas.",
    topicos: [
      {
        titulo: "O que aparece",
        passos: [
          "Hoje em números: tarefas atrasadas, que vencem hoje, em andamento e concluídas hoje. Toque num número para abrir a lista dessas tarefas.",
          "Check-lists de hoje: quantos foram feitos, quantos estão pendentes e quantos não foram realizados no tempo, mais os itens respondidos \"Não\".",
          "Manutenções em aberto: total por status e por prioridade, e as abertas há mais tempo (em vermelho a partir de 7 dias).",
          "Próximos 7 dias: alertas de datas e etapas de planos que vencem na semana.",
          "Escalados hoje: quem trabalha em cada turno e quem está de folga, férias ou falta.",
          "Tarefas no prazo nos últimos 30 dias: a porcentagem concluída até o prazo, por pessoa e por setor.",
        ],
      },
      {
        titulo: "Geral ou Meu painel",
        passos: [
          "Use os botões Geral e Meu painel, no alto, para ver a empresa toda ou só o que é seu.",
          "Quem só tem acesso às próprias tarefas vê sempre o Meu painel.",
        ],
      },
    ],
  },
  {
    slug: "tarefas",
    titulo: "Tarefas",
    icone: SquareKanban,
    resumo: "O quadro único com tudo o que precisa ser feito.",
    tela: "/tarefas",
    paraQue:
      "Todas as tarefas da empresa ficam aqui, venham de onde vierem: avulsas, check-lists, ações recorrentes, alertas, manutenções e planos. Cada coluna é um status (Solicitado, Em andamento, Concluído, Adiado, Cancelado...).",
    topicos: [
      {
        titulo: "Criar uma tarefa",
        passos: [
          "Toque em Nova tarefa.",
          "Escreva o que precisa ser feito e, se quiser, os detalhes.",
          "Escolha um ou mais responsáveis. Dá para puxar um setor inteiro ou todas as pessoas de uma vez.",
          "Quem pode atribuir: o Gestor escolhe qualquer pessoa; o Líder de setor só vê colaboradores (e ele mesmo) na lista, e o mesmo vale para ações e alertas. Colaborador não cria tarefas, mas todos abrem chamado de manutenção.",
          "Defina o prazo, a unidade, o setor e a categoria.",
          "Marque Exigir foto para concluir se quiser uma prova do serviço feito.",
          "Escolha se ela é pública (toda a equipe com acesso vê) ou privada (só você e os responsáveis veem) e toque em Criar tarefa.",
        ],
      },
      {
        titulo: "Tarefa que pede foto",
        passos: [
          "O cartão ganha a etiqueta Pede foto e a tarefa só vai para Concluído com uma foto.",
          "Abra a tarefa e toque em Enviar foto e concluir: o celular abre a câmera. A foto precisa ser tirada na hora; foto da galeria é recusada.",
          "Com várias pessoas, cada uma envia a sua foto ao marcar a própria parte. A foto fica na tarefa, com nome e horário.",
        ],
      },
      {
        titulo: "Acompanhar e mover",
        passos: [
          "Arraste o cartão para outra coluna ou use a caixa de status no próprio cartão. No celular, segure o cartão um instante até ele se soltar e arraste. Perto da borda, o quadro rola para os lados.",
          "Ao mover para Adiado, o app pede a nova data. Depois, o botão Retornar devolve a tarefa ao status anterior.",
          "Tarefas com prazo vencido ganham a etiqueta vermelha Atrasada.",
          "Em check-list pendente, o botão azul de lista no cartão abre o formulário para preencher na hora. Ao salvar, a tarefa vai sozinha para Concluído.",
          "Troque entre Quadro e Lista no alto da tela. A escolha fica salva.",
          "Filtre por módulo, unidade e status, ou toque em Minhas tarefas para ver só as suas.",
        ],
      },
      {
        titulo: "Dentro da tarefa",
        passos: [
          "Toque no título para abrir: lá ficam os detalhes, comentários e o histórico de cada mudança.",
          "O botão do WhatsApp abre uma mensagem pronta para o responsável.",
          "Quem tem permissão troca os responsáveis e torna a tarefa pública ou privada.",
          "Quem criou uma tarefa avulsa pode excluí-la.",
        ],
      },
      {
        titulo: "Tarefa com várias pessoas",
        passos: [
          "Com mais de um responsável, cada um marca a sua parte em Marcar minha parte como feita.",
          "Quando o último marcar, a tarefa vai sozinha para Concluído.",
        ],
      },
    ],
    dicas: [
      "Tarefas de dias futuros (check-lists e ações recorrentes) só aparecem no dia. Check-lists aparecem 1 hora antes do horário.",
      "Concluídas somem do quadro depois de 7 dias e canceladas depois de 48 horas. Elas continuam guardadas.",
    ],
  },
  {
    slug: "checklists",
    titulo: "Check-lists",
    icone: ListChecks,
    resumo: "Rotinas de abertura, fechamento e conferência, pelo app ou pelo QR Code.",
    tela: "/checklists",
    paraQue:
      "Um check-list é uma lista de itens para conferir em um horário certo, como abertura da loja ou temperatura dos freezers. Ele pode ser preenchido no app ou pelo QR Code da unidade, sem login.",
    topicos: [
      {
        titulo: "Montar um check-list",
        passos: [
          "Toque em Novo check-list e dê um nome.",
          "Defina o horário preferencial, a tolerância (depois disso fica atrasado) e a repetição (todos os dias, a cada 2 ou 3 dias, dias úteis, às segundas, toda semana...). Se mudar o horário depois, a tarefa de hoje que ainda não foi iniciada vai para o novo horário, sem ficar duplicada.",
          "Escolha o responsável: ele recebe a tarefa e o lembrete, e puxa a equipe para preencher.",
          "Em Lembrete antes, diga quantos minutos antes o responsável recebe o aviso no WhatsApp (0 = sem lembrete).",
          "Em Recebe o resultado, escolha quem recebe o resumo no WhatsApp quando o check-list é concluído.",
          "Marque se ele fica disponível no QR Code e quem pode preencher por lá: qualquer pessoa digitando o nome, ou só colaboradores com PIN.",
          "Adicione os itens. Cada um pode ser Sim/Não/Em processo, número ou texto.",
          "Em cada item, escolha se é obrigatório, se aceita foto, se a foto é obrigatória quando a resposta for \"Não\" e se um \"Não\" abre chamado de manutenção sozinho.",
          "Marque Foto obrigatória (câmera) quando o item sempre precisa de foto: sem ela o check-list não é enviado.",
          "Arraste pela alça ⋮⋮ para mudar a ordem e toque em Salvar check-list.",
        ],
      },
      {
        titulo: "Preencher",
        passos: [
          "No app: toque em Preencher no cartão do check-list, ou no botão azul de lista do cartão em Tarefas (também há Abrir check-list dentro da tarefa).",
          "Pelo QR Code: aponte a câmera do celular para o QR da unidade e escolha o check-list.",
          "Responda os itens, tire as fotos e toque em Salvar e enviar.",
          "As fotos são tiradas na hora: o botão de foto abre a câmera e uma foto antiga (de mais de 10 minutos, da galeria) é recusada.",
          "Depois de salvo, o botão Enviar resumo no WhatsApp manda o resultado para o grupo ou para quem você escolher.",
        ],
      },
      {
        titulo: "Acompanhar",
        passos: [
          "Em Preenchidos recentemente fica cada envio, com quem preencheu, a hora e quantos itens deram \"Não\".",
          "No quadro de Tarefas, o check-list do dia é concluído sozinho quando alguém preenche.",
          "Se ninguém preencher até 30 minutos depois do prazo, ele é encerrado como \"Não realizado no tempo\".",
        ],
      },
    ],
    dicas: [
      "Editar os itens não muda os check-lists que já foram preenchidos.",
      "Excluir um check-list mantém os preenchimentos no histórico; só as tarefas em aberto dele somem.",
    ],
  },
  {
    slug: "acoes",
    titulo: "Ações",
    icone: Repeat,
    resumo: "Tarefas que se repetem: limpeza, pagamentos, revisões.",
    tela: "/acoes",
    paraQue:
      "Ações recorrentes são tarefas que voltam sempre, como limpar a caixa d'água a cada 6 meses ou pagar o aluguel todo dia 10. Cada ocorrência vira uma tarefa no quadro no dia marcado.",
    topicos: [
      {
        titulo: "Criar uma ação",
        passos: [
          "Toque em Nova ação e dê um nome.",
          "Escolha a repetição (uma vez só, todos os dias, a cada 2, 3, 4, 10 ou 15 dias, um dia fixo da semana como às segundas ou aos sábados, toda semana, todo mês, a cada 3 ou 6 meses, todo ano...), o horário e a data inicial. \"A cada N dias\" conta a partir da data inicial; os dias da semana valem independente dela.",
          "Se quiser, defina uma data final. Vazio = repete sem fim.",
          "Em Prazo, diga quantas horas depois do horário a tarefa passa a contar como atrasada.",
          "Escolha os responsáveis, a unidade, o setor, a categoria e a visibilidade. Com Todas as unidades, cada unidade recebe a sua tarefa.",
          "Toque em Salvar ação.",
        ],
      },
      {
        titulo: "Mudar ou parar",
        passos: [
          "Toque na ação para editar. As mudanças valem para as próximas ocorrências.",
          "Para parar sem apagar, mude a situação para Inativa.",
          "Excluir a ação não apaga as tarefas que ela já criou.",
        ],
      },
    ],
  },
  {
    slug: "alertas",
    titulo: "Alertas",
    icone: CalendarClock,
    resumo: "Datas que não podem passar: alvará, AVCB, contratos.",
    tela: "/alertas",
    paraQue:
      "Um alerta guarda uma data importante e cria tarefas com antecedência para alguém agir a tempo. Ex.: 30 dias antes do vencimento do alvará, criar a tarefa \"Pedir renovação ao despachante\".",
    topicos: [
      {
        titulo: "Criar um alerta",
        passos: [
          "Toque em Novo alerta e escreva o que vence ou acontece.",
          "Escolha a data e se ela se repete (todo ano, a cada 6 meses...).",
          "Defina o horário em que as tarefas aparecem e o responsável padrão.",
          "Em Avisos, diga quantos dias antes cada tarefa deve ser criada e o que precisa ser feito. Dá para ter vários avisos, cada um com seus responsáveis.",
          "Toque em Salvar alerta.",
        ],
      },
      {
        titulo: "Como funciona",
        passos: [
          "Na antecedência marcada, a tarefa aparece no quadro. O prazo dela é a própria data do alerta.",
          "Na lista, cada alerta mostra quantos dias faltam: vermelho até 7 dias, laranja até 30.",
          "Para parar sem apagar, mude a situação para Inativo. Excluir não apaga as tarefas já criadas.",
        ],
      },
    ],
  },
  {
    slug: "planos",
    titulo: "Planos",
    icone: ChartGantt,
    resumo: "Projetos de médio e longo prazo, divididos em etapas.",
    tela: "/planos",
    paraQue:
      "Um plano organiza um projeto maior, como uma reforma ou a troca de um equipamento, em etapas com responsável e prazo. Cada etapa vira uma tarefa no quadro.",
    topicos: [
      {
        titulo: "Criar um plano",
        passos: [
          "Toque em Novo plano. Dê um nome e descreva o objetivo (o que se quer alcançar e por quê).",
          "Escolha o horizonte (médio prazo: 3 a 6 meses; longo prazo: 6 a 12 meses), o coordenador, o início e o término previsto.",
          "Toque em Criar plano e escolha se ele é público ou privado.",
        ],
      },
      {
        titulo: "Quem vê o plano",
        passos: [
          "Plano público: veem quem tem permissão de ver ou editar planos (o dono, o Gestor e o Líder de setor, se tiver essa permissão), o coordenador, quem criou e quem é responsável ou está na equipe de alguma etapa.",
          "Plano privado: só quem criou, o coordenador e quem está nas etapas veem. Nem o dono da empresa vê. As etapas também ficam privadas no quadro de Tarefas.",
          "Só quem criou troca entre público e privado (em Editar plano) e exclui um plano privado. O coordenador também pode editá-lo, se tiver permissão de editar planos.",
          "Etapas de plano privado não geram aviso automático no WhatsApp, como as demais tarefas privadas.",
        ],
      },
      {
        titulo: "Etapas",
        passos: [
          "Dentro do plano, toque em Nova etapa. Defina o que precisa ser feito, o responsável, o início previsto e o prazo.",
          "Marque de quais etapas ela depende: ela mostra \"Aguardando etapa...\" até as anteriores terminarem, e depois \"Pode começar\".",
          "Marque a equipe da etapa (força-tarefa): essas pessoas veem o plano e atualizam a etapa no quadro.",
          "Use as setas para mudar a ordem das etapas.",
        ],
      },
      {
        titulo: "Acompanhar",
        passos: [
          "A barra de progresso mostra quantas etapas já foram concluídas.",
          "Com datas preenchidas, o cronograma mostra as etapas no tempo, com a marca do dia de hoje.",
          "Mude a situação do plano (em planejamento, em andamento, pausado, concluído, cancelado) em Editar plano.",
        ],
      },
    ],
  },
  {
    slug: "manutencoes",
    titulo: "Manutenções",
    icone: Wrench,
    resumo: "Chamados de conserto, prestadores de serviço e patrimônio.",
    tela: "/chamados",
    paraQue:
      "Aqui ficam os chamados de manutenção (algo quebrou ou precisa de reparo), com prioridade, prazo, fotos, custo e histórico. Pelos botões no alto você chega aos Prestadores e ao Patrimônio.",
    topicos: [
      {
        titulo: "Abrir um chamado",
        passos: [
          "Toque em Abrir chamado e descreva o problema.",
          "Escolha a prioridade (urgente, alta, média, baixa). Ela define o prazo de atendimento, configurado em Configurações › Geral.",
          "Indique a unidade, o equipamento do patrimônio e o local, e anexe fotos.",
          "Se já souber, escolha o responsável interno ou o prestador de serviço.",
          "Quem não tem login abre chamado pelo QR Code da unidade, em Solicitar manutenção.",
          "Um item de check-list respondido \"Não\" também pode abrir chamado sozinho.",
        ],
      },
      {
        titulo: "Acompanhar",
        passos: [
          "Os chamados aparecem num quadro como o de Tarefas, que pode ser filtrado por prioridade, unidade e equipamento.",
          "Dentro do chamado, em Andamento, mude o status com um comentário. Para adiar, informe a nova data.",
          "Registre o prestador que atendeu, o custo, novas fotos e comentários. Tudo fica no histórico.",
        ],
      },
      {
        titulo: "Prestadores",
        passos: [
          "Em Manutenções › Prestadores, cadastre eletricista, refrigeração, encanador... com telefone e tipos de serviço.",
          "Na lista, ligue ou chame no WhatsApp com um toque.",
          "No cadastro do prestador aparecem os chamados que ele atendeu.",
          "Já tem uma lista? Use Importar planilha: baixe a planilha-modelo, preencha e envie.",
        ],
      },
      {
        titulo: "Patrimônio",
        passos: [
          "Em Manutenções › Patrimônio, cadastre móveis e equipamentos com código, marca, modelo, compra, nota fiscal, garantia e foto.",
          "Na trajetória de cada item, registre manutenções, mudança de unidade ou de situação, venda e baixa.",
          "O item mostra o gasto total com manutenção e o aviso de garantia vencida.",
          "O botão Abrir chamado no item já abre o chamado com o equipamento escolhido.",
          "Também dá para importar o patrimônio por planilha, com o histórico de manutenções.",
        ],
      },
    ],
  },
  {
    slug: "escalas",
    titulo: "Escalas",
    icone: CalendarDays,
    resumo: "Turnos, folgas e trocas da equipe, semana a semana.",
    tela: "/escalas",
    paraQue:
      "A escala mostra quem trabalha em cada dia e turno, por unidade. A equipe vê os próprios dias e pede trocas pelo app.",
    topicos: [
      {
        titulo: "Montar a escala (quem tem permissão)",
        passos: [
          "Em Turnos, cadastre os turnos com horário (ex.: Abertura 06:00–14:00) ou só pelo período (manhã, tarde, noite), cada um com uma cor.",
          "Na grade, escolha para cada pessoa e dia: um turno, folga, férias ou falta. Toque em Salvar escala.",
          "Use as setas para mudar de semana e os filtros de unidade e setor.",
          "Copiar semana anterior preenche só os dias que estão em branco.",
          "O botão ↻ ao lado do nome repete a semana daquela pessoa nas próximas 8 semanas, só nos dias em branco. Uma mudança feita à mão sempre vale mais.",
          "O botão do WhatsApp ao lado do nome manda a escala da semana para a pessoa.",
          "A última linha da grade mostra quantos trabalham por dia.",
        ],
      },
      {
        titulo: "Para a equipe",
        passos: [
          "Abaixo da grade, Seus próximos dias mostra os seus turnos e folgas.",
          "Para trocar, abra Trocas, escolha o seu dia e quem vai assumir, e toque em Pedir troca.",
          "Quem monta a escala aprova ou recusa. Aprovada, o sistema troca os dois na grade (ou o colega assume, se estava livre).",
        ],
      },
    ],
    dicas: ["Líder de setor monta só a escala do próprio setor."],
  },
  {
    slug: "agenda",
    titulo: "Agenda",
    icone: CalendarSync,
    resumo: "A sua semana no app e no Google Agenda do celular.",
    tela: "/agenda",
    paraQue:
      "A Agenda junta numa semana as suas tarefas, o que está programado (check-lists, ações e alertas) e os seus turnos e folgas. Também leva tudo isso para o Google Agenda ou o calendário do iPhone.",
    topicos: [
      {
        titulo: "Ver a semana",
        passos: [
          "Use as setas para mudar de semana. Itens atrasados aparecem marcados.",
          "Quem cadastra colaboradores pode escolher outra pessoa no seletor e ver a agenda dela.",
        ],
      },
      {
        titulo: "Levar para o Google Agenda ou iPhone",
        passos: [
          "Toque em Criar meu link de agenda.",
          "No computador, toque em Adicionar ao Google Agenda e confirme. A agenda aparece também no celular, na mesma conta Google.",
          "No iPhone, toque em iPhone / Outlook e confirme em Assinar.",
          "As novidades podem levar algumas horas para aparecer, porque o Google atualiza sozinho de tempos em tempos.",
          "Se o link foi parar com outra pessoa, use Trocar link. Para parar, use Desligar.",
          "Quem cadastra colaboradores cria o link de quem não entra no app, em Links da equipe, e manda pelo WhatsApp.",
        ],
      },
      {
        titulo: "Trazer seus eventos do Google",
        passos: [
          "No computador, abra o Google Agenda › engrenagem › Configurações › sua agenda › Integrar agenda.",
          "Copie o Endereço secreto no formato iCal e cole em Trazer meus eventos do Google.",
          "Seus eventos pessoais passam a aparecer na sua semana. Só você vê.",
        ],
      },
    ],
  },
  {
    slug: "whatsapp",
    titulo: "WhatsApp",
    icone: MessageCircle,
    resumo: "Avisos e automações saindo pelo número da empresa.",
    tela: "/whatsapp",
    paraQue:
      "Conecta um número da empresa para mandar avisos à equipe: manuais (com confirmação) ou automáticos. Aparece no menu para quem gerencia o WhatsApp ou envia avisos.",
    topicos: [
      {
        titulo: "Conexão",
        passos: [
          "Escolha como conectar: API alternativa (Evolution, pelo QR Code), API oficial da Meta ou Ensaio, que simula tudo sem mandar mensagem.",
          "Na Evolution, abra o WhatsApp do celular que vai enviar › Configurações › Dispositivos conectados › Conectar um dispositivo, e aponte para o QR.",
          "Use Pausar envios para segurar tudo na fila e Liberar envios para voltar.",
        ],
      },
      {
        titulo: "Destinatários",
        passos: [
          "Só números autorizados recebem mensagens. Cadastre nome e WhatsApp, ligando ao colaborador quando for alguém da equipe.",
          "Em Automações, Autorizar a equipe pelo celular do cadastro autoriza todo mundo de uma vez.",
          "Em Avisos automáticos de check-list, escolha quem recebe quando um check-list é concluído.",
        ],
      },
      {
        titulo: "Avisos",
        passos: [
          "Escreva o aviso, escolha o destinatário e salve como rascunho.",
          "Confira e toque em Confirmar e enviar. Sai uma única mensagem.",
          "A lista mostra o caminho de cada aviso: na fila, aceito, entregue e lido.",
        ],
      },
      {
        titulo: "Automações",
        passos: [
          "Tarefa atribuída: quem recebe uma tarefa ganha uma mensagem com o prazo. Cada ocorrência de uma ação recorrente também avisa os responsáveis quando é criada (com o dia e a hora em que acontece); tarefas privadas e rotinas de check-list ficam de fora.",
          "Lembrete de ação recorrente: os responsáveis recebem outro aviso alguns minutos antes do horário da ocorrência (padrão 30; dá para mudar na própria tela).",
          "Tarefa concluída: quem criou é avisado quando ela termina.",
          "Check-list concluído: o resultado sai sozinho para quem foi cadastrado (desligado, vira rascunho para confirmar).",
          "Lembrete de check-list: o responsável recebe um lembrete antes do horário.",
          "Boas-vindas: quem é autorizado recebe uma apresentação pedindo para salvar o número.",
          "Resumo do dia: no horário escolhido, cada pessoa recebe o turno de hoje, as tarefas que vencem hoje e as atrasadas. Mudar o horário no mesmo dia libera um novo envio do resumo (quem já recebeu hoje não recebe de novo). Só recebe quem está ligado a um colaborador: ao autorizar, escolha o colaborador ou use o mesmo celular do cadastro (o app liga sozinho). Na lista de Destinatários, toque no nome para abrir o colaborador ligado (dá para trocar) e o botão de desativar (o resumo e os avisos vão para as tarefas desse colaborador).",
          "Reenviar o resumo de hoje: botão no fim da tela, para quando o resumo não chegou (ex.: WhatsApp desconectado). Manda de novo a todos, inclusive a quem já recebeu, com a marca \"Reenvio do resumo do dia\" no início; pede confirmação antes. Se nada for enviado, a mensagem na tela diz o motivo de cada pessoa. Os avisos automáticos usam sempre o número real quando existe um número de ensaio (simulação).",
          "Incluir link do app: abaixo de cada aviso, escolha se a mensagem leva o link para abrir no app. Já vem ligado na tarefa atribuída e no lembrete de check-list, e desligado nos demais.",
          "Contato para dúvidas: o aviso leva o nome e o celular de quem atribuiu, concluiu ou preencheu (no lembrete, de quem recebe o resultado). Na tarefa atribuída fica na própria linha \"Atribuída por: Nome · +55 ...\". A pessoa toca no número e conversa direto. Não aparece quando quem recebe é a própria pessoa, nem se o colaborador estiver sem celular no cadastro.",
          "O limite diário evita excesso: passou dele, a mensagem vira rascunho em Avisos.",
        ],
      },
    ],
    dicas: [
      "Tarefas privadas não geram aviso automático.",
      "Comece com um único número de teste antes de autorizar a equipe toda.",
      "Link em toda mensagem aumenta o risco de o WhatsApp tratar o número como robô. Deixe o link só onde a pessoa precisa abrir o app.",
    ],
  },
  {
    slug: "configuracoes",
    titulo: "Configurações",
    icone: Settings,
    resumo: "Empresa, unidades, equipe e permissões.",
    tela: "/config/geral",
    paraQue:
      "Onde o gestor ajusta a empresa e decide quem pode fazer o quê. Aparece no menu para quem tem alguma permissão de configuração.",
    topicos: [
      {
        titulo: "Geral",
        passos: [
          "Empresa: nome e fuso horário (todas as datas do app seguem esse fuso).",
          "Unidades: cada loja ou endereço. Em QR Code e detalhes você imprime o QR da unidade. Se ele vazou, Gerar novo QR faz o antigo parar de funcionar.",
          "Status do Kanban: nome, cor e tipo de cada coluna. Dá para criar status de um módulo só, como \"Aguardando peça\" nas manutenções.",
          "Prazos dos chamados: quantas horas cada prioridade tem para ser atendida.",
          "Setores (valem para todas as unidades) e categorias (etiquetas para filtrar).",
        ],
      },
      {
        titulo: "Colaboradores",
        passos: [
          "Toque em Novo colaborador e preencha nome, cargo, WhatsApp, perfil, setor e unidades.",
          "Com e-mail, a pessoa pode entrar no app: ela cria a conta com o mesmo e-mail e já entra vinculada. Até lá aparece Convite pendente.",
          "Com PIN de 4 dígitos, a pessoa preenche check-lists pelo QR Code sem login.",
          "Para tirar alguém sem perder o histórico, mude a situação para inativo.",
        ],
      },
      {
        titulo: "Perfis de acesso",
        passos: [
          "Cada perfil é um conjunto de caixinhas de permissão, agrupadas por módulo.",
          "Em várias permissões você escolhe o alcance: só as minhas, do meu setor, da minha unidade ou da empresa toda.",
          "Já vêm prontos Gestor, Líder de setor e Colaborador. Crie outros em Novo perfil.",
          "O dono da empresa sempre tem acesso total.",
        ],
      },
    ],
  },
  {
    slug: "claude",
    titulo: "Perguntar ao Claude",
    icone: Bot,
    resumo: "Consultar a operação conversando com o Claude.",
    paraQue:
      "Ligando o Atalaia como conector no Claude, você pergunta em linguagem normal, como \"o que está atrasado hoje?\" ou \"quem trabalha sábado na cozinha?\", e o Claude busca a resposta aqui. Por enquanto é só consulta: o Claude não cria, muda nem apaga nada no Atalaia.",
    topicos: [
      {
        titulo: "Ligar o conector",
        passos: [
          "No Claude (site ou aplicativo), abra Configurações › Conectores e toque em Adicionar conector personalizado.",
          "Dê o nome Atalaia e cole o endereço do app seguido de /api/mcp, por exemplo https://assistente-operacional-eta.vercel.app/api/mcp.",
          "Toque em Conectar. Abre a tela de login do Atalaia: entre com seu e-mail e senha e toque em Permitir.",
          "Pronto: numa conversa nova, peça ao Claude o que quiser saber da operação.",
        ],
      },
      {
        titulo: "O que dá para perguntar",
        passos: [
          "Resumo do dia: atrasadas, vencem hoje, check-lists, manutenções abertas e quem está escalado.",
          "Tarefas com filtros de pessoa, setor, unidade, módulo, situação e prazo.",
          "Check-lists de um dia, com os itens respondidos \"Não\".",
          "Manutenções abertas ou concluídas, com prestador, equipamento e há quantos dias estão abertas.",
          "Escala de um dia ou de um período, próximos alertas de datas, planos e suas etapas.",
          "Equipe, prestadores e patrimônio (inclusive garantias que vão vencer).",
        ],
      },
      {
        titulo: "Segurança",
        passos: [
          "Cada pessoa conecta com o próprio login. O Claude vê exatamente o que ela vê no app, com as mesmas permissões e itens privados.",
          "Quem participa de mais de uma empresa diz ao Claude de qual empresa está falando.",
          "Para desligar, remova o conector Atalaia nas configurações do Claude.",
        ],
      },
    ],
  },
];

export function secaoPorSlug(slug: string) {
  return SECOES.find((s) => s.slug === slug);
}
