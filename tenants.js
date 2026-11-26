const TENANTS = {
  l3telecom: {
    id: 'l3telecom',
    name: 'L3 Telecom',
    channelName: 'L3 Telecom · Atendimento',
    segment: 'Provedor de Internet & Telecom',
    channelMode: 'Integrado ao WhatsApp oficial da empresa',
    contextLabel: 'Plano / Endereço',
    sectors: ['Suporte Técnico', 'Financeiro', 'Visitas / Campo'],
    defaultSector: 'Suporte Técnico',
    quickPrompts: [
      { label: '2ª via do boleto', text: 'Como faço para pegar a 2ª via do meu boleto?' },
      { label: 'Internet lenta', text: 'Minha internet está muito lenta desde ontem' },
      { label: 'Cabo rompido (Emergência)', text: 'Rompeu um cabo na minha rua e caiu tudo aqui na empresa!' }
    ],
    qualifyPrompt:
      'Entendi, vamos resolver sua conexão. Para agilizar com o técnico, me informe:\n1) Seu nome completo ou CPF/CNPJ do titular\n2) As luzes do roteador estão todas verdes ou há alguma luz vermelha piscando (ex.: LOS)?',
    faq: [
      {
        title: '1. Segunda via de boleto e código Pix',
        keywords: ['boleto', 'fatura', '2a via', '2ª via', 'pagamento', 'pix', 'pagar'],
        sector: 'Financeiro',
        answer:
          'Você mesmo pode pegar sua 2ª via em segundos:\n1. Acesse l3telecom.com.br/fatura ou o App L3 Cliente.\n2. Digite o CPF ou CNPJ do titular.\n3. Em "Faturas em Aberto", baixe o PDF ou copie o código Pix.\n\nEsse procedimento resolveu o seu problema?'
      },
      {
        title: '2. Troca de senha e nome do Wi-Fi',
        keywords: ['wifi', 'wi-fi', 'senha', 'roteador', 'trocar senha'],
        sector: 'Suporte Técnico',
        answer:
          'Para mudar o nome ou a senha do seu Wi-Fi:\n1. Abra o App L3 Cliente.\n2. Entre em "Meu Roteador > Configurações de Wi-Fi".\n3. Defina a nova senha (mín. 8 caracteres) e toque em Salvar.\n\nEsse procedimento resolveu o seu problema?'
      },
      {
        title: '3. Desbloqueio de confiança após pagamento',
        keywords: ['desbloqueio', 'confianca', 'confiança', 'bloqueado', 'corte', 'religar'],
        sector: 'Financeiro',
        answer:
          'Se você já pagou a fatura e o sinal ainda não voltou:\n1. Abra o App L3 Cliente.\n2. Toque em "Faturas > Informar Pagamento / Desbloqueio de Confiança".\n3. O sinal é liberado automaticamente em até 15 minutos.\n\nEsse procedimento resolveu o seu problema?'
      },
      {
        title: '4. Reinício rápido em caso de travamento pontual',
        keywords: ['reiniciar', 'travando', 'desligar roteador'],
        sector: 'Suporte Técnico',
        answer:
          'Para instabilidade em um único aparelho:\n1. Desligue o roteador da tomada por 30 segundos.\n2. Ligue novamente e aguarde 2 minutos para sincronizar.\n\nEsse procedimento resolveu o seu problema?'
      }
    ]
  },

  clinica: {
    id: 'clinica',
    name: 'Clínica Vida',
    channelName: 'Clínica Vida · Atendimento',
    segment: 'Saúde & Atendimento Digital',
    channelMode: 'Canal personalizado próprio da clínica',
    contextLabel: 'Exame / Unidade',
    sectors: ['Recepção Digital', 'Triagem / Enfermagem', 'Financeiro'],
    defaultSector: 'Recepção Digital',
    quickPrompts: [
      { label: 'Resultado de exame', text: 'Como faço para ver o resultado do meu exame online?' },
      { label: 'Dúvida de jejum', text: 'Agendei um exame de sangue mas não sei quantas horas de jejum precisa' },
      { label: 'Erro no laudo (Urgente)', text: 'Abri meu resultado no portal e o laudo veio com os dados de outro paciente!' }
    ],
    qualifyPrompt:
      'Para que nossa equipe verifique isso com prioridade, me informe:\n1) Nome completo e CPF do paciente\n2) Qual é o exame, protocolo ou data do atendimento?',
    faq: [
      {
        title: '1. Consulta de resultados online',
        keywords: ['resultado', 'resultados', 'laudo', 'pdf', 'online', 'ver exame'],
        sector: 'Recepção Digital',
        answer:
          'Seus exames ficam disponíveis online assim que liberados:\n1. Acesse clinicavida.com.br/resultados.\n2. Informe o número do protocolo e sua data de nascimento.\n3. Baixe o laudo em PDF.\n\nEsse procedimento resolveu o seu problema?'
      },
      {
        title: '2. Reagendamento ou cancelamento pelo site',
        keywords: ['reagendar', 'remarcar', 'cancelar', 'agendamento', 'consulta', 'desmarcar'],
        sector: 'Recepção Digital',
        answer:
          'Você pode alterar seu horário sem fila:\n1. Acesse clinicavida.com.br/agenda.\n2. Faça login com seu CPF e código enviado por SMS.\n3. Escolha "Reagendar" ou "Cancelar" com até 12h de antecedência.\n\nEsse procedimento resolveu o seu problema?'
      },
      {
        title: '3. Acesso à teleconsulta (link da videochamada)',
        keywords: ['teleconsulta', 'video', 'vídeo', 'link', 'camera', 'câmera', 'online'],
        sector: 'Recepção Digital',
        answer:
          'Para entrar na sua teleconsulta:\n1. O link é liberado 15 minutos antes do horário no portal clinicavida.com.br/teleconsulta.\n2. Permita o uso de câmera e microfone no navegador.\n\nEsse procedimento resolveu o seu problema?'
      },
      {
        title: '4. Nota fiscal e reembolso de convênio',
        keywords: ['nota fiscal', 'nf', 'recibo', 'reembolso', 'convenio', 'convênio'],
        sector: 'Financeiro',
        answer:
          'Para baixar sua nota fiscal para reembolso:\n1. Entre em clinicavida.com.br/financeiro.\n2. Selecione o atendimento pago e clique em "Emitir NF-e em PDF".\n\nEsse procedimento resolveu o seu problema?'
      },
      {
        title: '5. Horário de atendimento digital e unidades',
        keywords: ['horario', 'horário', 'endereco', 'endereço', 'abre', 'fecha'],
        sector: 'Recepção Digital',
        answer:
          'Atendemos de Segunda a Sexta (07h às 19h) e Sábados (07h30 às 12h), na Av. Central, 450.\n\nEsse procedimento resolveu o seu problema?'
      }
    ]
  },

  veloce: {
    id: 'veloce',
    name: 'Veloce Store',
    channelName: 'Veloce Store · Pós-Venda',
    segment: 'E-commerce & Logística',
    channelMode: 'Integrado ao WhatsApp e chat do site',
    contextLabel: 'Pedido / Produto',
    sectors: ['Logística / Entregas', 'Trocas e Garantias', 'Financeiro'],
    defaultSector: 'Logística / Entregas',
    quickPrompts: [
      { label: 'Rastrear pedido', text: 'Onde acompanho o rastreio da minha entrega?' },
      { label: 'Produto com defeito', text: 'Meu pedido chegou hoje mas a caixa veio amassada e o produto não liga' },
      { label: 'Cobrança dupla (Urgente)', text: 'Cobraram duas vezes no meu cartão e bloquearam minha conta!' }
    ],
    qualifyPrompt:
      'Sinto muito pelo transtorno! Para já abrir sua solicitação no setor responsável, me informe:\n1) Seu nome completo (ou e-mail da compra)\n2) O número do pedido e qual produto apresentou o problema (ex.: #VEL-4021, Fone Bluetooth)',
    faq: [
      {
        title: '1. Rastreamento de pedido',
        keywords: ['rastrear', 'rastreio', 'entrega', 'onde esta', 'codigo', 'código'],
        sector: 'Logística / Entregas',
        answer:
          'Você pode acompanhar sua entrega em tempo real:\n1. Acesse velocestore.com.br/rastrear.\n2. Informe seu CPF ou número do pedido.\n3. O status é atualizado a cada etapa da transportadora.\n\nEsse procedimento resolveu o seu problema?'
      },
      {
        title: '2. Prazo de devolução gratuita (7 dias)',
        keywords: ['devolver', 'devolucao', 'devolução', 'arrependimento', 'prazo'],
        sector: 'Trocas e Garantias',
        answer:
          'Você tem até 7 dias corridos após o recebimento para solicitar devolução gratuita pelo menu "Meus Pedidos > Devolver item", gerando o código de postagem na hora.\n\nEsse procedimento resolveu o seu problema?'
      },
      {
        title: '3. Segunda via da Nota Fiscal (NF-e)',
        keywords: ['nota fiscal', 'nf', 'nfe', 'danfe', 'xml'],
        sector: 'Financeiro',
        answer:
          'Para baixar a Nota Fiscal da sua compra:\n1. Acesse "Meus Pedidos" no site ou app da Veloce Store.\n2. Clique no pedido desejado e selecione "Baixar NF-e (PDF)".\n\nEsse procedimento resolveu o seu problema?'
      },
      {
        title: '4. Prazo de estorno após cancelamento',
        keywords: ['estorno', 'reembolso', 'pix devolvido', 'fatura cartao'],
        sector: 'Financeiro',
        answer:
          'O prazo de estorno depende da forma de pagamento:\n- Pix: devolução automática em até 24 horas úteis.\n- Cartão de crédito: aparece em até 2 faturas, conforme a operadora.\n\nEsse procedimento resolveu o seu problema?'
      }
    ]
  }
};

module.exports = { TENANTS };
