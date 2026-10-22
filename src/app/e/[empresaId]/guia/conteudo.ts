import {
  AlarmClock,
  BookOpen,
  Bot,
  CalendarClock,
  CalendarDays,
  CalendarSync,
  ChartGantt,
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  MessageCircle,
  Repeat,
  Settings,
  ShieldCheck,
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
          "Contagens: cadastre as contagens de produtos (o que antes ia num formulário do Google).",
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
        titulo: "Instalar como aplicativo",
        passos: [
          "Ao abrir o Atalaia no navegador do celular, aparece o aviso \"Deseja instalar o app?\". Toque em Instalar.",
          "O Atalaia ganha um ícone com o logo na tela inicial e abre sem a barra do navegador.",
          "No iPhone (Safari) o aviso mostra o caminho: Compartilhar › Adicionar à Tela de Início.",
          "Tocou em Agora não? O aviso volta só depois de 3 dias. Quem já instalou não vê o aviso.",
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
          "Semana das ações: logo no topo, o quadro de segunda a domingo com as ações recorrentes previstas para cada dia, na cor da categoria. No computador é uma grade de 7 colunas; no celular cada dia é uma linha que abre ao tocar, e o dia de hoje já vem aberto. Toque em Ver demais semanas para abrir a tela da semana, onde você avança ou volta de semana pelas setas, retorna com Esta semana e, se precisar, usa o botão Exportar PDF para imprimir.",
          "Hoje em números: tarefas atrasadas, que vencem hoje, em andamento e concluídas hoje. Toque num número para abrir a lista dessas tarefas.",
          "Check-lists de hoje: quantos foram feitos, quantos estão pendentes e quantos não foram realizados no tempo, mais os itens respondidos \"Não\".",
          "Manutenções em aberto: total por status e por prioridade, e as abertas há mais tempo (em vermelho a partir de 7 dias).",
          "Próximos 7 dias: alertas de datas e etapas de projetos que vencem na semana.",
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
      {
        titulo: "Status do WhatsApp",
        passos: [
          "Quem gerencia o WhatsApp vê, no alto do Painel, uma etiqueta verde quando o número está conectado e vermelha quando caiu.",
          "Toque na etiqueta para ir a WhatsApp › Conexão e reconectar pelo QR Code. O status é conferido toda vez que o Painel abre.",
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
      "Todas as tarefas da empresa ficam aqui, venham de onde vierem: avulsas, check-lists, ações recorrentes, alertas, manutenções e projetos. Cada coluna é um status (Solicitado, Em andamento, Concluído, Adiado, Cancelado...).",
    topicos: [
      {
        titulo: "Criar uma tarefa",
        passos: [
          "Toque em Nova tarefa.",
          "Escreva o que precisa ser feito e, se quiser, os detalhes.",
          "Escolha um ou mais responsáveis. Dá para puxar um setor inteiro ou todas as pessoas de uma vez.",
          "Em Avisar também (ciente), escolha quem só precisa ficar sabendo: a pessoa recebe a tarefa no WhatsApp e enxerga o cartão, mas não é responsável, não conta nas partes e não conclui.",
          "Com 2 ou mais responsáveis, a chave Todos os responsáveis precisam concluir decide: desligada (padrão), qualquer um conclui e a tarefa fecha para todos; ligada, cada um marca a sua parte.",
          "Quem pode atribuir: o Gestor escolhe qualquer pessoa; o Líder de setor só vê colaboradores (e ele mesmo) na lista, e o mesmo vale para ações e alertas. Colaborador não cria tarefas, mas todos abrem chamado de manutenção.",
          "Defina o prazo, a unidade, o setor e a categoria.",
          "Marque Exigir foto para concluir se quiser uma prova do serviço feito.",
          "Escolha se ela é pública (toda a equipe com acesso vê) ou privada (só você e os responsáveis veem) e toque em Criar tarefa.",
        ],
      },
      {
        titulo: "Editar uma tarefa já criada",
        passos: [
          "Abra a tarefa e toque em Editar título, descrição e prazo (aparece para quem tem a permissão Editar tarefas no perfil).",
          "Mude o que precisar, por exemplo puxar o prazo para hoje, e toque em Salvar alterações. A mudança de prazo fica registrada no histórico, com quem mudou. Não há aviso novo no WhatsApp.",
          "Tarefa concluída não muda mais de status, e não dá para editar tarefa concluída ou cancelada. Tarefas de ação recorrente mudam só aquela ocorrência (a ação continua igual). Check-lists, manutenções e etapas de projeto são editados na tela do próprio módulo.",
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
          "Use a barra Pesquisar tarefas para achar pelo título ou pela descrição (vale no Quadro e na Lista). Filtre por módulo, unidade e status, ou toque em Minhas tarefas para ver só as suas.",
        ],
      },
      {
        titulo: "Dentro da tarefa",
        passos: [
          "Toque no título para abrir: lá ficam os detalhes, comentários e o histórico de cada mudança.",
          "No cartão de cima, a caixa azul Mudar status troca o status sem voltar ao Quadro. Adiado pede a nova data e Cancelado pede o motivo; em Adiado aparece o botão Retornar. Em check-list só aparece Concluído; em tarefa conjunta ou que pede foto, a conclusão vem de Marcar minha parte ou Enviar foto.",
          "O botão do WhatsApp abre uma mensagem pronta para o responsável.",
          "Quem tem permissão troca os responsáveis e torna a tarefa pública ou privada.",
          "Quem criou uma tarefa avulsa pode excluí-la.",
        ],
      },
      {
        titulo: "Tarefa com várias pessoas",
        passos: [
          "Com mais de um responsável e a chave Todos os responsáveis precisam concluir ligada, cada um marca a sua parte em Marcar minha parte como feita. Com a chave desligada, qualquer responsável conclui pelo status.",
          "Quem tem permissão ajusta os cientes e a chave na própria tarefa (Salvar cientes). O ciente recebe o aviso de que foi incluído e o de conclusão.",
          "Quando o último marcar, a tarefa vai sozinha para Concluído.",
        ],
      },
    ],
    dicas: [
      "Tarefas de dias futuros (check-lists e ações recorrentes) só aparecem no dia. Check-lists aparecem 1 hora antes do horário.",
      "Concluídas somem do quadro depois de 7 dias e canceladas depois de 48 horas. Elas continuam guardadas.",
      "Check-list concluído não aparece em Tarefas (nem no quadro, nem na lista), porque se repete várias vezes ao dia. Ele continua na Central de Check-lists, no histórico e nas contagens do Painel.",
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
          "Escolha um ou mais responsáveis: cada um recebe a tarefa, o lembrete e aparece no resumo do dia, e puxa a equipe para preencher. Ao trocar os responsáveis, as tarefas abertas de hoje em diante passam para os novos.",
          "Em Lembrete antes, diga quantos minutos antes o responsável recebe o aviso no WhatsApp (0 = sem lembrete).",
          "Em Recebe o resultado, escolha quem recebe o resumo no WhatsApp quando o check-list é concluído. Quem só recebe o resultado não ganha a tarefa nem o lembrete.",
          "Marque se ele fica disponível no QR Code e quem pode preencher por lá: qualquer pessoa digitando o nome, ou só colaboradores com PIN.",
          "Adicione os itens. Cada um pode ser Sim/Não/Em processo, número ou texto.",
          "Em cada item, escolha se é obrigatório, se aceita foto, se a foto é obrigatória quando a resposta for \"Não\" e se um \"Não\" abre chamado de manutenção sozinho.",
          "Em Problema, escolha o que é ruim naquele item: \"Sim = normal · Não = problema\" (o padrão, como em \"O chão está limpo?\"), \"Sim = problema · Não = normal\" (como em \"Algum funcionário faltou?\") ou nenhuma resposta (só registrar). Só a resposta que é problema aparece em vermelho e entra na contagem de problemas do Painel e do resumo do WhatsApp. A foto obrigatória e o chamado automático por \"Não\" só aparecem quando o problema é o \"Não\".",
          "Marque Foto obrigatória (câmera) quando o item sempre precisa de foto: sem ela o check-list não é enviado.",
          "Arraste pela alça ⋮⋮ para mudar a ordem e toque em Salvar check-list.",
        ],
      },
      {
        titulo: "Criar vários parecidos",
        passos: [
          "Com o check-list preenchido, toque em Salvar e copiar: ele é salvo e abre um novo com os mesmos itens, horário, tolerância, lembrete, repetição, responsáveis, unidade, setor, categoria e opções de QR Code.",
          "O nome vem como \"Cópia de ...\", já selecionado: digite o novo nome, ajuste o que mudar e salve (ou repita o botão para o próximo). A cópia não altera o original.",
        ],
      },
      {
        titulo: "Achar um check-list",
        passos: [
          "Na lista de cards, use a barra de busca para procurar pelo nome, pela descrição ou pelo setor do check-list (não importa acento nem maiúscula).",
          "Ao lado, filtre por Setor, Unidade, Com ou sem QR Code e Ativos ou inativos. Os filtros valem na hora e podem ser combinados; toque em Limpar para voltar a ver todos.",
        ],
      },
      {
        titulo: "Preencher",
        passos: [
          "No app: toque em Preencher no cartão do check-list, ou no botão azul de lista do cartão em Tarefas (também há Abrir check-list dentro da tarefa).",
          "Pelo QR Code: aponte a câmera do celular para o QR da unidade. A página separa por tipo (Chamado de manutenção, Check-lists e Contagens): em colunas no computador e em lista no celular. Use a barra Pesquisar para achar o item pelo nome.",
          "Os check-lists já preenchidos hoje mostram o selo verde Feito hoje às HH:MM, no QR e também nos cartões da tela Check-lists (a tela Contagens mostra o mesmo selo). É só um aviso: dá para abrir e preencher de novo no mesmo dia.",
          "Responda os itens, tire as fotos e toque em Salvar e enviar.",
          "As fotos são tiradas na hora: o botão de foto abre a câmera e uma foto antiga (de mais de 10 minutos, da galeria) é recusada.",
          "As fotos de check-lists, tarefas e manutenções ficam guardadas por 30 dias e depois são apagadas sozinhas, para não encher o espaço do sistema. As respostas e o histórico continuam; só a imagem some. Se precisar de uma foto por mais tempo, abra a imagem e salve no celular antes.",
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
    slug: "contagens",
    titulo: "Contagens",
    icone: ClipboardList,
    resumo: "Quantidades por turno: produtos, produção, retiradas, embalados.",
    tela: "/contagens",
    paraQue:
      "Uma contagem registra quanto há de cada produto, como a contagem da churrasqueira no início do turno, a produção do dia, as retiradas (perda, doação, almoço da equipe) ou os potes embalados. Substitui o formulário do Google: a equipe preenche pelo app ou pelo QR Code, e o histórico fica guardado para consultar, comparar e baixar em Excel. Com meta, o app já mostra quanto falta de cada item.",
    topicos: [
      {
        titulo: "Montar uma contagem",
        passos: [
          "Toque em Nova contagem e dê um nome (ex.: Contagem da churrasqueira).",
          "Em Instrução, diga quando contar (ex.: no início do turno). Em Turnos, escreva os turnos separados por vírgula (ex.: Dia, Noite) ou deixe vazio.",
          "Escolha a unidade, o setor e se ela fica disponível no QR Code da unidade.",
          "Adicione os itens: o nome do produto e a unidade de medida (unidades, varas, pacotes, kg...). Use ↑ e ↓ para mudar a ordem.",
          "Para usar meta, marque Usar meta por dia da semana, dê nome à coluna do que falta (Embalar, Produzir, Repor...) e preencha a meta de cada item em cada dia. Repetir Seg em todos copia a meta de segunda para a semana toda. Dia sem meta fica vazio.",
          "Para o que é preparado hoje para amanhã (ex.: embalar a farofa de domingo no sábado), marque Meta é para o dia seguinte no item. Digite a necessidade de cada dia normalmente (Dom 450, Sáb 230...) e quem conta no sábado vê a meta de domingo, com a sugestão já calculada em cima dela.",
          "Com meta, Pedir quanto vai fazer (já vem marcado) põe um segundo campo em cada item, com o nome da coluna (ex.: Embalar), para lançar o que vai ser feito de fato.",
          "Mudar itens e metas vale para as próximas contagens; o histórico não muda. Para parar de usar sem apagar o histórico, mude a situação para Inativa.",
        ],
      },
      {
        titulo: "Horário, lembrete e WhatsApp",
        passos: [
          "No editar da contagem, marque Horário, lembrete e WhatsApp. Funciona como no check-list.",
          "Informe o horário: com turnos, um horário para cada turno (ex.: Dia 10:00, Noite 18:00). Depois, a tolerância (minutos até ficar atrasada), o lembrete antes (0 = sem lembrete) e o Repetir (todos os dias, dias úteis...).",
          "Escolha os responsáveis: cada um recebe a tarefa no Kanban e o lembrete no WhatsApp, e puxa a equipe para contar.",
          "Em Recebe o resultado, escolha quem recebe no WhatsApp as quantidades (e o que falta para a meta) assim que a contagem é enviada.",
          "A tarefa aparece em Tarefas 1 hora antes do horário, com o botão azul para abrir a contagem já no turno certo. Ao salvar a contagem, a tarefa daquele dia e turno é concluída sozinha.",
          "Não contou até 30 minutos depois do prazo (horário + tolerância): a tarefa é cancelada como Não realizado no tempo.",
        ],
      },
      {
        titulo: "Contar",
        passos: [
          "No app: em Contagens, toque em Contar no cartão. Pelo QR Code: aponte a câmera para o QR da unidade e escolha a contagem em Contagens (a pessoa digita o nome, sem PIN).",
          "Confira a data (vem a de hoje) e escolha o turno.",
          "Digite a quantidade de cada item. Item que não se aplica pode ficar em branco.",
          "Com meta, cada item mostra na hora a meta do dia e quanto falta, em vermelho (ou Meta atingida ✓).",
          "Se a contagem pede quanto vai fazer, cada item tem dois campos: Tem (o que foi contado) e o da ação (ex.: Embalar), que já mostra a sugestão. Digite o que vai fazer de fato; em branco, vale a sugestão.",
          "Toque em Salvar contagem. Depois de salvo, Enviar resumo no WhatsApp manda as quantidades para o grupo.",
          "O cartão mostra Feito hoje com o turno e a hora de cada envio; no QR aparece o selo verde Feito hoje.",
        ],
      },
      {
        titulo: "Resultados e Excel",
        passos: [
          "Toque em Resultados no cartão: aparece uma tabela como a planilha do formulário, uma linha por envio e uma coluna por item, com a observação no fim. Com meta, o número vermelho embaixo é quanto faltava e o azul é quanto a pessoa disse que vai fazer.",
          "Filtre por período (vem os últimos 30 dias), turno e quem contou, e toque em Filtrar.",
          "Em Ver, escolha Soma por dia para juntar os turnos de cada dia. O número pequeno é a diferença para o dia anterior.",
          "A linha Total soma o período.",
          "Baixar Excel gera a planilha do período filtrado, no mesmo formato das respostas do Google Forms.",
          "Quem pode editar contagens vê Apagar em cada linha, para tirar um envio errado ou repetido.",
        ],
      },
      {
        titulo: "Comparar contagens",
        passos: [
          "Em Contagens, toque em Comparar e marque itens de contagens diferentes, por exemplo o frango assado da contagem, o frango para assar da produção e o frango de perda da retirada.",
          "Escolha o período e toque em Comparar: cada item vira uma coluna, somada por dia, com o total no fim.",
        ],
      },
    ],
    dicas: [
      "Sem Horário, lembrete e WhatsApp a contagem não cria tarefa: fica só no cartão e no QR Code, para contar quando quiser.",
      "Quem pode montar check-lists também monta contagens; quem vê check-lists preenchidos também vê os resultados. Isso pode ser mudado em Configurações › Perfis de acesso.",
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
          "Escolha a repetição (uma vez só, todos os dias, a cada 2, 3, 4, 10 ou 15 dias, um dia fixo da semana como às segundas ou aos sábados, toda semana, todo mês, a cada 3, 4, 5 ou 6 meses, todo ano...), o horário e a data inicial. \"A cada N dias\" conta a partir da data inicial; os dias da semana valem independente dela.",
          "Para algo fora da lista, escolha Personalizar...: informe \"a cada N dias, semanas, meses ou anos\"; na repetição semanal marque os dias da semana; na mensal escolha entre o mesmo dia do mês ou um dia da semana do mês (por exemplo, na 2ª terça-feira ou na última sexta-feira).",
          "Se quiser, defina uma data final. Vazio = repete sem fim.",
          "Em Prazo, escolha a hora em que cada ocorrência vence (como na tarefa avulsa) e, se passar da meia-noite, quantos dias depois. A tela mostra o resultado, por exemplo \"Cada ocorrência vence às 18:00\". Depois desse momento a tarefa aparece como atrasada.",
          "Escolha os responsáveis, quem só fica ciente (recebe o aviso e o lembrete, sem precisar concluir), a chave Todos os responsáveis precisam concluir, a unidade, o setor, a categoria e a visibilidade. Com Todas as unidades, cada unidade recebe a sua tarefa.",
          "Toque em Salvar ação.",
        ],
      },
      {
        titulo: "Ver a semana",
        passos: [
          "Em Ações, toque em Ver semana: aparece um quadro de segunda a domingo com as ações previstas para cada dia, no horário de cada uma.",
          "Cada cartão usa a cor da categoria da ação; sem categoria fica branco. Toque no cartão para abrir a ação.",
          "Use as setas para ir à semana anterior ou à próxima, \"Esta semana\" para voltar a hoje, e os filtros de setor e categoria (aplicam assim que você escolhe) para enxergar só uma parte.",
          "Exportar PDF abre a impressão só com o quadro, em paisagem: imprima para quem não tem celular nem computador no trabalho ou escolha \"Salvar como PDF\" para guardar o arquivo.",
          "A mesma semana aparece no Painel, logo ao abrir o sistema (em Meu painel, só as ações em que você é responsável).",
          "Concluir a tarefa de uma ação não a tira do quadro: ele mostra o que está programado pela repetição, não o que falta fazer.",
          "Diferente do quadro de Tarefas (o que já entrou na fila), aqui você vê o que ainda vai acontecer. Ações privadas só aparecem para quem pode vê-las.",
        ],
      },
      {
        titulo: "Ligar a um equipamento ou móvel",
        passos: [
          "No campo Equipamento ou móvel da ação, pesquise e escolha um item do Patrimônio (opcional). Serve para limpeza, revisão, troca de filtro e outras rotinas de um item.",
          "As tarefas geradas levam o nome do item (com link para ele) no quadro, na lista e no detalhe, e a mensagem do WhatsApp também o cita. A lista de Ações mostra o item embaixo do nome e a pesquisa acha ações pelo nome dele.",
          "No item do Patrimônio aparece o cartão Ações recorrentes, com as ações ligadas e as últimas tarefas concluídas.",
          "Itens vendidos ou aposentados não aparecem para novas ligações.",
        ],
      },
      {
        titulo: "Criar várias parecidas",
        passos: [
          "Com o formulário preenchido, toque em Salvar e criar nova a partir desta: a ação é salva e abre uma nova com a mesma repetição, horário, datas, prazo, responsáveis, unidade, setor, categoria, visibilidade e situação.",
          "O nome vem como \"Cópia de ...\", já selecionado: digite o novo nome, ajuste o que mudar e salve (ou repita o botão para a próxima).",
        ],
      },
      {
        titulo: "Procurar uma ação",
        passos: [
          "A lista vem separada por categoria, cada uma com seu título; as ações sem categoria ficam no fim, em Sem categoria.",
          "Na parte de cima, digite parte do nome (ou da descrição) no campo de pesquisa: a lista filtra enquanto você digita.",
          "Escolha um setor e/ou uma categoria: a lista muda na hora, sem botão. Limpar volta à lista completa.",
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
    slug: "rotinas",
    titulo: "Rotinas",
    icone: AlarmClock,
    resumo: "O cronograma da operação: o que fazer em cada horário.",
    tela: "/rotinas",
    paraQue:
      "Rotinas são as atividades-chave que se repetem nos mesmos horários, como abrir o caixa às 8h ou conferir a vitrine às 11h, para a casa estar pronta quando o movimento chegar. É um quadro de consulta: mostra o que precisa acontecer, a que horas e qual função responde. Não cria tarefas nem cobra prazo; para isso use Ações.",
    topicos: [
      {
        titulo: "Consultar o quadro",
        passos: [
          "Ao abrir, aparece o dia de hoje, agrupado por horário. Escolha outro dia da semana, ou Semana toda, para ver uma tabela com os dias marcados de cada rotina.",
          "Filtre por setor e por função: os setores são botões: toque em um para ver só aquele setor e marque dois ou mais para ver as atividades lado a lado, uma coluna por setor, em cada horário (em Todos os setores volta a lista única). A tela muda assim que você escolhe.",
          "Em cada rotina, toque em Passo a passo para ver as instruções.",
          "Exportar PDF abre a impressão só com o quadro (com o passo a passo aberto), em paisagem.",
        ],
      },
      {
        titulo: "Cadastrar uma rotina",
        passos: [
          "Quem tem permissão vê o botão Nova rotina. Informe a atividade, o horário e o dia da semana em que vale (vêm todos marcados).",
          "Em Instrução e passo a passo, escreva um passo por linha: eles aparecem numerados.",
          "Escolha a função e os setores (botões: marque quantos precisar, ou Todos os setores para uma rotina da empresa inteira; ela aparece em cada setor marcado) e, se a empresa tiver mais de uma unidade, a unidade (vazio = todas).",
          "Para tirar do quadro sem apagar, mude a situação para Inativa.",
          "Para adiantar o cadastro, use Importar planilha: envie a planilha de respostas do levantamento (uma coluna por horário, como \"8:00h > atividade chave 1\"). Cada atividade vira uma rotina todos os dias, sem função; setores novos são criados e rotinas repetidas não duplicam.",
        ],
      },
      {
        titulo: "Funções",
        passos: [
          "As funções ficam em Configurações › Geral. Cadastre as que existem na operação (Caixa, Montador, Churrasqueiro...).",
          "Ligar a função a cada colaborador é opcional, em Configurações › Colaboradores.",
        ],
      },
    ],
    dicas: [
      "Para o aviso de uma atividade chegar à pessoa com prazo, crie também uma Ação com o mesmo horário.",
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
          "Em Avisos, diga quantos dias antes cada tarefa deve ser criada e o que precisa ser feito. Dá para ter vários avisos, cada um com seus responsáveis e, se quiser, pessoas em Avisar também (ciente), que ficam sabendo sem ser responsáveis. Avisos com o mesmo texto e o mesmo prazo geram uma tarefa só.",
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
    titulo: "Projeto",
    icone: ChartGantt,
    resumo: "Projetos de médio e longo prazo, divididos em etapas.",
    tela: "/planos",
    paraQue:
      "Um projeto organiza uma iniciativa maior, como uma reforma ou a troca de um equipamento, em etapas com responsável e prazo. Cada etapa vira uma tarefa no quadro.",
    topicos: [
      {
        titulo: "Criar um projeto",
        passos: [
          "Toque em Novo projeto. Dê um nome e descreva o objetivo (o que se quer alcançar e por quê).",
          "Escolha o horizonte (médio prazo: 3 a 6 meses; longo prazo: 6 a 12 meses), o coordenador, o início e o término previsto.",
          "Toque em Criar projeto e escolha se ele é público ou privado.",
        ],
      },
      {
        titulo: "Quem vê o projeto",
        passos: [
          "Projeto público: veem quem tem permissão de ver ou editar projetos (o dono, o Gestor e o Líder de setor, se tiver essa permissão), o coordenador, quem criou e quem é responsável ou está na equipe de alguma etapa.",
          "Projeto privado: só quem criou, o coordenador e quem está nas etapas veem. Nem o dono da empresa vê. As etapas também ficam privadas no quadro de Tarefas.",
          "Só quem criou troca entre público e privado (em Editar projeto) e exclui um projeto privado. O coordenador também pode editá-lo, se tiver permissão de editar projetos.",
          "Etapas de projeto privado não geram aviso automático no WhatsApp, como as demais tarefas privadas.",
        ],
      },
      {
        titulo: "Etapas",
        passos: [
          "Dentro do projeto, toque em Nova etapa. Defina o que precisa ser feito, o responsável, o início previsto e o prazo.",
          "Marque de quais etapas ela depende: ela mostra \"Aguardando etapa...\" até as anteriores terminarem, e depois \"Pode começar\".",
          "Marque a equipe da etapa (força-tarefa): essas pessoas veem o projeto e atualizam a etapa no quadro.",
          "Use as setas para mudar a ordem das etapas.",
        ],
      },
      {
        titulo: "Acompanhar",
        passos: [
          "A barra de progresso mostra quantas etapas já foram concluídas.",
          "Com datas preenchidas, o cronograma mostra as etapas no tempo, com a marca do dia de hoje.",
          "Mude a situação do projeto (em planejamento, em andamento, pausado, concluído, cancelado) em Editar projeto.",
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
          "Indique a unidade, o equipamento do patrimônio e o local, e anexe fotos. A lista de equipamentos tem um campo de pesquisa: digite parte do nome para filtrar.",
          "Se já souber, escolha o responsável interno (esse campo some quando a empresa usa o recebedor central, veja abaixo) ou o prestador de serviço. A lista de prestadores tem campo de pesquisa, e o botão + ao lado cadastra um novo na hora (nome e telefone) para quem tem permissão em Prestadores.",
          "Quem não tem login abre chamado pelo QR Code da unidade, em Solicitar manutenção.",
          "Um item de check-list respondido \"Não\" também pode abrir chamado sozinho.",
        ],
      },
      {
        titulo: "Recebedor central e delegar",
        passos: [
          "Em Configurações › Geral, o cartão Recebedor central de chamados tem uma chave. Ligada, quem abre o chamado não escolhe o responsável: o chamado cai nos recebedores que você marcou (um ou mais) e eles recebem o aviso, no app e no WhatsApp.",
          "Dentro do chamado, o recebedor (ou quem gerencia chamados) usa o cartão Delegar este chamado: escolha quem vai acompanhar e salve. Quem entrar na lista é avisado. Mantenha o seu nome na lista para compartilhar; se não delegar, o chamado continua com você.",
          "No celular é o mesmo caminho: abra o chamado pelo aviso e role até o cartão Delegar. Com a chave desligada, tudo volta a ser como antes e quem tem permissão escolhe o responsável ao abrir.",
        ],
      },
      {
        titulo: "Acompanhar",
        passos: [
          "Os chamados aparecem num quadro como o de Tarefas, que pode ser filtrado por prioridade, unidade e equipamento.",
          "Quando o chamado tem um equipamento do patrimônio, o nome dele aparece no cartão do quadro, no Painel, na lista de Tarefas e no aviso de WhatsApp, para você saber qual é o equipamento sem abrir o chamado.",
          "Dentro do chamado, na caixa azul Mudar status (a mesma da tarefa), escolha o novo status. A data e hora do ato já vêm preenchidas com agora, mas dá para trocar quando o registro é de algo que já aconteceu. Para adiar, informe a nova data; para cancelar, o motivo.",
          "Ao concluir o chamado, informe o valor gasto e a solução do caso. Se faltar algum, o sistema pergunta se quer salvar assim mesmo ou voltar e preencher. A solução fica visível no chamado e no histórico.",
          "Em Gestão (quem tem permissão) dá para corrigir o título e a descrição do chamado, além de prioridade, prazo, responsável, equipamento e custo.",
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
          "Use a busca no alto da lista: ela filtra enquanto você digita (nome, código, marca ou modelo), junto com os filtros de tipo, situação e unidade.",
          "O item mostra o gasto total com manutenção e o aviso de garantia vencida.",
          "O botão Abrir chamado no item já abre o chamado com o equipamento escolhido.",
          "Ações recorrentes ligadas ao item (e as últimas tarefas concluídas) aparecem no cartão Ações recorrentes do item.",
          "Compartilhar PDF, no item, gera um arquivo com foto, dados e trajetória para enviar a quem não tem acesso ao sistema. Os valores financeiros entram por padrão; desmarque a opção para enviar sem eles. No celular abre o compartilhamento (WhatsApp, e-mail); no computador baixa o arquivo.",
          "Na lista, cada item mostra uma miniatura da foto à esquerda para facilitar a identificação; itens sem foto mostram um ícone de caixa.",
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
          "Regra marcada (ensaio) usa o número real da unidade quando ele estiver conectado. Cada pessoa recebe um aviso só por check-list, mesmo estando numa regra e em Recebe o resultado.",
          "Cadastrou errado? Toque no nome do destinatário, corrija o nome ou o número e salve. Número novo é autorizado na hora e o antigo deixa de receber.",
          "Funcionário saiu? Use Desativar (para de receber e o histórico fica) ou Excluir (apaga o cadastro e as regras de check-list dele). Quem já recebeu avisos só pode ser desativado.",
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
          "Tarefa atribuída: quem recebe uma tarefa ganha uma mensagem com o prazo. Cada ocorrência de uma ação recorrente também avisa os responsáveis quando é criada (com o dia e a hora em que acontece); tarefas privadas e rotinas de check-list ficam de fora. A mensagem termina lembrando de concluir a tarefa no app (não dá para concluir pelo WhatsApp).",
          "Prazo venceu e a tarefa segue aberta: passou o prazo sem a tarefa ser concluída, cancelada ou adiada, os responsáveis recebem um lembrete para concluir no app e quem criou também é avisado. Sai uma vez por prazo (se o prazo mudar, avisa de novo), nunca de madrugada, e não vale para check-list nem tarefa privada. Dá para desligar aqui.",
          "Lembrete de ação recorrente: os responsáveis recebem outro aviso alguns minutos antes do horário da ocorrência (padrão 30; dá para mudar na própria tela).",
          "Tarefa concluída: quem criou é avisado quando ela termina.",
          "Check-list concluído: o resultado sai sozinho para quem foi cadastrado (desligado, vira rascunho para confirmar).",
          "Lembrete de check-list: o responsável recebe um lembrete antes do horário. Vale também para as contagens com horário.",
          "Boas-vindas: quem é autorizado recebe uma apresentação pedindo para salvar o número.",
          "Resumo do dia: no horário escolhido, só recebe quem tem tarefa que vence hoje ou atrasada (sem pendência, nenhuma mensagem; o turno sozinho não conta). Quem tem, recebe o turno de hoje, as tarefas que vencem hoje e as atrasadas. Mudar o horário no mesmo dia libera um novo envio do resumo (quem já recebeu hoje não recebe de novo). Só recebe quem está ligado a um colaborador: ao autorizar, escolha o colaborador ou use o mesmo celular do cadastro (o app liga sozinho). Na lista de Destinatários, toque no nome para abrir o colaborador ligado (dá para trocar) e o botão de desativar (o resumo e os avisos vão para as tarefas desse colaborador).",
          "Reenviar o resumo de hoje: botão no fim da tela, para quando o resumo não chegou (ex.: WhatsApp desconectado). Manda de novo a todos, inclusive a quem já recebeu, com a marca \"Reenvio do resumo do dia\" no início; pede confirmação antes. Se nada for enviado, a mensagem na tela diz o motivo de cada pessoa. Os avisos automáticos usam sempre o número real quando existe um número de ensaio (simulação).",
          "Incluir link do app: abaixo de cada aviso, escolha se a mensagem leva o link para abrir no app. Já vem ligado na tarefa atribuída e no lembrete de check-list, e desligado nos demais.",
          "Contato para dúvidas: o aviso termina com o nome e o celular de quem atribuiu, concluiu ou preencheu (no lembrete, de quem recebe o resultado). A pessoa toca no número e conversa direto.",
          "Sem avisos de madrugada: os avisos de tarefa atribuída e de tarefa concluída não saem entre 22h e 8h (horário da empresa). Ficam na fila e são enviados a partir das 8h. Lembretes, resumo do dia e envios manuais não são afetados.",
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
          "Status do Kanban: escolha o status na caixa de seleção para ver só as configurações dele (nome, cor, tipo, módulo, subir/descer e desativar). Para criar um, escolha \"+ Novo status\" na mesma caixa. Dá para criar status de um módulo só, como \"Aguardando peça\" nas manutenções.",
          "Prazos dos chamados: quantas horas cada prioridade tem para ser atendida.",
          "Recebedor central de chamados: chave que faz todo chamado novo cair em quem você escolher, que depois delega ao responsável.",
          "Funções: quem responde por cada atividade, sem citar a pessoa (Caixa, Cozinheiro, Líder de salão...). Servem para as Rotinas e podem ser ligadas a cada colaborador. Clique no nome para ativar ou desativar; excluir deixa colaboradores e rotinas dela sem função.",
          "Setores (valem para todas as unidades) e categorias (etiquetas para filtrar; toque na categoria para mudar o nome ou a cor, e tudo que já usa essa categoria continua ligado).",
        ],
      },
      {
        titulo: "Colaboradores",
        passos: [
          "Toque em Novo colaborador e preencha nome, cargo, WhatsApp, perfil, setor, função (opcional) e unidades.",
          "Com e-mail, a pessoa pode entrar no app: ela cria a conta com o mesmo e-mail e já entra vinculada. Até lá aparece Convite pendente.",
          "Para não depender do e-mail de confirmação, abra o colaborador e use Acesso ao app: defina uma senha e toque em Criar acesso. O login já nasce pronto; passe o e-mail e a senha para a pessoa. Se o e-mail já tiver conta no app, a pessoa entra com a senha dela.",
          "Senha: cada pessoa troca a própria senha tocando no nome dela no fim do menu (Minha conta). Se alguém esqueceu, abra o colaborador e defina uma senha nova no card Senha (não vale para o dono nem para quem também participa de outra empresa; nesses casos, fale com o administrador do sistema).",
          "Com PIN de 4 dígitos, a pessoa preenche check-lists pelo QR Code sem login.",
          "E-mail de login: abra o colaborador e use o card E-mail de login para trocar o e-mail com que ele entra. A senha continua a mesma e não precisa confirmar e-mail. Não vale para o dono, para quem também participa de outra empresa nem para administradores do sistema; nesses casos fale com o administrador do sistema.",
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
    slug: "admin-master",
    titulo: "Admin Master",
    icone: ShieldCheck,
    resumo: "Só para o administrador do sistema: empresas, contas, senhas e e-mails.",
    paraQue:
      "Painel de quem administra o Atalaia (aparece no menu só para o Admin Master). Mostra todas as empresas, aprova ou rejeita cadastros, suspende, define o limite de unidades e cria contas já prontas.",
    topicos: [
      {
        titulo: "Empresas",
        passos: [
          "Empresa cadastrada por alguém de fora fica Aguardando aprovação. Toque em Aprovar para liberar.",
          "Rejeitar e excluir apaga a empresa pendente e tudo que foi cadastrado nela, depois de confirmar. Não dá para desfazer; o login de quem cadastrou continua existindo.",
          "Suspender bloqueia o acesso da empresa (ex.: mensalidade em atraso) até você reativar. Salvar limite define quantas unidades ela pode ter.",
          "Entrar coloca você como membro com acesso total; Sair tira.",
        ],
      },
      {
        titulo: "Cadastrar usuário",
        passos: [
          "Em Usuários › Cadastrar usuário, preencha nome, e-mail e senha e escolha a empresa.",
          "Empresa nova: informe o nome (e a primeira unidade, se quiser). Ela já nasce ativa, com a pessoa como dona.",
          "Empresa existente: a pessoa entra como Colaborador ou com Acesso completo. Se já havia um convite com o mesmo e-mail, ele é usado.",
          "A conta nasce com o e-mail confirmado: é só passar o e-mail e a senha para a pessoa entrar. Se o e-mail já tinha login, ele é confirmado e recebe a senha informada.",
        ],
      },
      {
        titulo: "Trocar senha",
        passos: [
          "Em Usuários › Trocar senha, informe o e-mail do login e a senha nova (8 caracteres ou mais).",
          "Serve também para destravar quem se cadastrou e nunca recebeu o e-mail de confirmação.",
        ],
      },
      {
        titulo: "Trocar e-mail",
        passos: [
          "Em Usuários › Trocar e-mail, informe o e-mail atual do login e o e-mail novo.",
          "O e-mail novo já fica confirmado, a senha continua a mesma e o e-mail muda também no cadastro da pessoa em todas as empresas dela.",
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
          "Ações recorrentes cadastradas, mesmo as que ainda não geraram tarefa: responsáveis, repetição, horário, setor, próxima ocorrência e se estão ativas ou pausadas.",
          "Rotinas por horário, dia da semana, setor ou função, e os modelos de check-list com seus itens.",
          "Carga de tarefas por pessoa (pendentes, atrasadas, concluídas) e taxa de cumprimento dos check-lists num período, com os itens que mais deram problema.",
          "Indicadores de manutenção (tempo médio para resolver, prestadores, equipamentos com defeito repetido) e cobertura da escala (dias com setor sem ninguém, folgas e faltas por pessoa).",
          "Histórico e comentários de uma tarefa ou chamado, alertas cadastrados (sem avisos, sem responsável, avisos já gerados), chamados de um prestador e situação do WhatsApp (conexão e mensagens com falha).",
          "Na equipe, quem está sem WhatsApp cadastrado; nas tarefas, filtros por quem criou e por categoria.",
          "Check-lists de um dia, com os itens respondidos \"Não\".",
          "Manutenções abertas ou concluídas, com prestador, equipamento e há quantos dias estão abertas.",
          "Escala de um dia ou de um período, próximos alertas de datas, projetos e suas etapas.",
          "Equipe, prestadores e patrimônio (inclusive garantias que vão vencer).",
          "Histórico de manutenção de um equipamento: trajetória (manutenções, trocas de unidade, venda), chamados com solução e custo, total gasto e ações recorrentes ligadas, com filtro por período e tipo de evento.",
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
