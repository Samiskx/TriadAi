const http = require('http');
const fs = require('fs');
const path = require('path');
const { TENANTS } = require('./tenants');

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

const PORT = Number(process.env.PORT || 3000);
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim();
const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const PUBLIC_DIR = path.join(__dirname, 'public');

const PRIORITY_WEIGHT = { Alta: 3, Media: 2, Baixa: 1 };

const store = {};
for (const key of Object.keys(TENANTS)) {
  store[key] = {
    sessions: {},
    tickets: [],
    ticketSeq: 1,
    metrics: {
      total_atendimentos: 0,
      chamados_evitados: 0,
      tickets_abertos: 0,
      taxa_deflexao_percentual: 0,
      minutos_economizados: 0
    }
  };
}

function recalcMetrics(tenantState) {
  const m = tenantState.metrics;
  m.taxa_deflexao_percentual =
    m.total_atendimentos > 0
      ? Number(((m.chamados_evitados / m.total_atendimentos) * 100).toFixed(1))
      : 0;
}

function sortTickets(tickets) {
  const statusWeight = { 'Em Atendimento': 2, Aberto: 2, Concluido: 1 };
  return [...tickets].sort((a, b) => {
    const swDiff = (statusWeight[b.status] || 0) - (statusWeight[a.status] || 0);
    if (swDiff !== 0) return swDiff;
    const diff = (PRIORITY_WEIGHT[b.prioridade] || 0) - (PRIORITY_WEIGHT[a.prioridade] || 0);
    if (diff !== 0) return diff;
    return new Date(b.criado_em) - new Date(a.criado_em);
  });
}

function getOrCreateSession(tenantId, sessionId) {
  const tState = store[tenantId];
  if (!tState.sessions[sessionId]) {
    tState.sessions[sessionId] = {
      session_id: sessionId,
      tenant_id: tenantId,
      estado: 'INICIADA',
      qualification_turns: 0,
      pending_priority: null,
      human_takeover: false,
      ticket_locked: false,
      ticket_id: null,
      counted: false,
      messages: [],
      agent_outbox: [],
      collected: {
        problema: null,
        solicitante: null,
        local_ou_servico: null
      }
    };
  }
  return tState.sessions[sessionId];
}

function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function detectEmergency(text) {
  const norm = normalize(text);
  const terms = [
    'rompeu',
    'cabo rompido',
    'caiu tudo',
    'bairro',
    'regiao',
    'fora do ar',
    'outro paciente',
    'dados de outro',
    'erro no laudo',
    'emergencia',
    'urgente',
    'fraude',
    'bloquearam minha conta',
    'cobraram duas vezes',
    'fogo',
    'curto',
    'parou tudo'
  ];
  return terms.some((t) => norm.includes(t));
}

function detectTicketResolution(text) {
  const norm = normalize(text);
  const terms = [
    'ja resolveu',
    'já resolveu',
    'resolvi',
    'consegui resolver',
    'voltou a funcionar',
    'voltou aqui',
    'deu certo',
    'funcionou',
    'pode fechar',
    'pode concluir',
    'cancelar chamado',
    'cancela o chamado',
    'nao precisa mais'
  ];
  return terms.some((t) => norm.includes(normalize(t)));
}

function detectOutOfContext(text) {
  const norm = normalize(text);
  const offTopicTerms = [
    'receita de bolo',
    'futebol',
    'flamengo',
    'palmeiras',
    'corinthians',
    'politica',
    'eleicao',
    'presidente',
    'piada',
    'me conte uma historia',
    'poema',
    'codigo em python',
    'javascript',
    'previsao do tempo',
    'clima hoje',
    'quem ganhou',
    'capital da franca'
  ];
  return offTopicTerms.some((t) => norm.includes(t));
}

function inferSector(tenant, text) {
  const norm = normalize(text);
  if (tenant.id === 'l3telecom') {
    if (norm.includes('boleto') || norm.includes('fatura') || norm.includes('pix') || norm.includes('cobranca')) {
      return 'Financeiro';
    }
    if (norm.includes('cabo') || norm.includes('rua') || norm.includes('poste') || norm.includes('visita')) {
      return 'Visitas / Campo';
    }
    return 'Suporte Técnico';
  }
  if (tenant.id === 'clinica') {
    if (norm.includes('jejum') || norm.includes('preparo') || norm.includes('enfermagem') || norm.includes('medicacao')) {
      return 'Triagem / Enfermagem';
    }
    if (norm.includes('boleto') || norm.includes('pagamento') || norm.includes('nota') || norm.includes('convenio') || norm.includes('valor') || norm.includes('cobranca')) {
      return 'Financeiro';
    }
    return 'Recepção Digital';
  }
  if (tenant.id === 'veloce') {
    if (norm.includes('defeito') || norm.includes('amassada') || norm.includes('nao liga') || norm.includes('troca') || norm.includes('garantia')) {
      return 'Trocas e Garantias';
    }
    if (norm.includes('cobraram') || norm.includes('cartao') || norm.includes('fraude') || norm.includes('reembolso') || norm.includes('estorno')) {
      return 'Financeiro';
    }
    return 'Logística / Entregas';
  }
  return tenant.defaultSector;
}

function matchFaq(tenant, text) {
  const norm = normalize(text);
  let best = null;
  let bestScore = 0;
  for (const item of tenant.faq) {
    let score = 0;
    for (const kw of item.keywords) {
      if (norm.includes(normalize(kw))) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return bestScore > 0 ? best : null;
}

function extractUserDetails(session, message) {
  if (!session.collected.problema) {
    session.collected.problema = message;
  }
  if (session.qualification_turns >= 1) {
    const parts = message.split(/[,;\n-]+/).map((p) => p.trim()).filter(Boolean);
    const orderMatch = message.match(/(#[\w-]+|pedido\s*[\w#-]+)/i);
    if (orderMatch && parts.length === 1) {
      session.collected.local_ou_servico = orderMatch[0].trim();
      const rest = message.replace(orderMatch[0], '').trim();
      if (rest) session.collected.solicitante = rest;
      return;
    }
    if (!session.collected.solicitante && parts[0]) {
      session.collected.solicitante = parts[0];
    }
    if (!session.collected.local_ou_servico) {
      session.collected.local_ou_servico = parts.length > 1 ? parts.slice(1).join(' — ') : message;
    }
  }
}

function buildTicketSummary(tenant, session, priority, rawMessage) {
  const userMsgs = session.messages.filter((m) => m.role === 'user').map((m) => m.content);
  const combined = [...userMsgs, rawMessage].join(' | ');
  const sector = inferSector(tenant, combined);

  const solicitante = session.collected.solicitante || 'Não informado pelo cliente';
  const localOuServico = session.collected.local_ou_servico || 'Não informado pelo cliente';
  const baseProblem = session.collected.problema || rawMessage;

  let titulo = baseProblem.trim();
  if (titulo.length > 56) titulo = titulo.slice(0, 53) + '...';

  return {
    abrir: true,
    titulo,
    setor: tenant.sectors.includes(sector) ? sector : tenant.defaultSector,
    prioridade: priority,
    dados_coletados: {
      solicitante,
      local_ou_servico: localOuServico
    },
    resumo_tecnico: `Solicitação recebida: "${baseProblem}". Contexto adicional: "${rawMessage}". Direcionado automaticamente para ${sector} (Prioridade ${priority}).`
  };
}

function runLocalEngine(tenant, session, message) {
  const norm = normalize(message);

  if (session.ticket_locked) {
    if (detectTicketResolution(message)) {
      return {
        resposta_usuario: `Ótima notícia! Já marquei o chamado #${session.ticket_id} como **Concluído** na fila de ${tenant.name} para que a equipe não perca tempo. Qualquer coisa, estou por aqui!`,
        acao: 'concluir_ticket',
        fonte_faq: null,
        fez_pergunta_qualificacao: false,
        ticket: { abrir: false, concluir: true }
      };
    }
    return {
      resposta_usuario: `Seu chamado #${session.ticket_id} já está na fila priorizada de ${tenant.name}. Assim que um atendente assumir, ele já terá todo o resumo em mãos! (Se você já conseguiu resolver por conta própria, é só me avisar que eu concluo o chamado.)`,
      acao: 'continuar_chat',
      fonte_faq: null,
      fez_pergunta_qualificacao: false,
      ticket: { abrir: false }
    };
  }

  if (detectOutOfContext(message) && session.qualification_turns === 0) {
    return {
      resposta_usuario: `Sou o assistente de atendimento da **${tenant.name}** (${tenant.segment}). Só posso ajudar com dúvidas e chamados relacionados aos nossos serviços (${tenant.sectors.join(', ')}). Como posso te ajudar com a ${tenant.name} hoje?`,
      acao: 'continuar_chat',
      fonte_faq: null,
      fez_pergunta_qualificacao: false,
      ticket: { abrir: false }
    };
  }

  if (norm.includes('humano') || norm.includes('atendente') || norm.includes('pessoa')) {
    if (session.qualification_turns >= 1) {
      const ticket = buildTicketSummary(tenant, session, 'Media', message);
      return {
        resposta_usuario: `Perfeito! Já resumi tudo e encaminhei seu chamado para ${ticket.setor} com prioridade ${ticket.prioridade}.`,
        acao: 'abrir_ticket',
        fonte_faq: null,
        fez_pergunta_qualificacao: false,
        ticket
      };
    }
    return {
      resposta_usuario: tenant.qualifyPrompt,
      acao: 'continuar_chat',
      fonte_faq: null,
      fez_pergunta_qualificacao: true,
      ticket: { abrir: false }
    };
  }

  if (detectEmergency(message) && session.qualification_turns === 0) {
    session.pending_priority = 'Alta';
    return {
      resposta_usuario:
        `Entendi que é uma situação crítica (prioridade Alta)! Para nossa equipe agir rápido, me informe agora:\n1) Qual o **bairro/rua** ou local exato afetado?\n2) Seu **nome completo** (ou CPF/contrato) para contato?`,
      acao: 'continuar_chat',
      fonte_faq: null,
      fez_pergunta_qualificacao: true,
      ticket: { abrir: false }
    };
  }

  if (detectEmergency(message) && session.qualification_turns >= 1) {
    extractUserDetails(session, message);
    const ticket = buildTicketSummary(tenant, session, 'Alta', message);
    return {
      resposta_usuario: `Recebido! Já abri o chamado com prioridade **ALTA** para o setor **${ticket.setor}** com a localização informada.`,
      acao: 'abrir_ticket',
      fonte_faq: null,
      fez_pergunta_qualificacao: false,
      ticket
    };
  }

  if (session.estado !== 'EM_QUALIFICACAO') {
    const faqHit = matchFaq(tenant, message);
    if (faqHit) {
      return {
        resposta_usuario: faqHit.answer,
        acao: 'propor_faq',
        fonte_faq: faqHit.title,
        fez_pergunta_qualificacao: false,
        ticket: { abrir: false }
      };
    }
  }

  extractUserDetails(session, message);

  if (session.qualification_turns >= 1) {
    const prio =
      session.pending_priority ||
      (norm.includes('vermelha') || norm.includes('sem sinal') || norm.includes('nao liga') || norm.includes('defeito')
        ? 'Media'
        : 'Baixa');
    const ticket = buildTicketSummary(tenant, session, prio, message);
    return {
      resposta_usuario: `Tudo certo! Organizei seu chamado e enviei o resumo completo para **${ticket.setor}** (Prioridade ${ticket.prioridade}). Nossa equipe já vai dar sequência.`,
      acao: 'abrir_ticket',
      fonte_faq: null,
      fez_pergunta_qualificacao: false,
      ticket
    };
  }

  return {
    resposta_usuario: tenant.qualifyPrompt,
    acao: 'continuar_chat',
    fonte_faq: null,
    fez_pergunta_qualificacao: true,
    ticket: { abrir: false }
  };
}

function buildSystemPrompt(tenant, session) {
  const faqText = tenant.faq.map((f) => `## ${f.title}\n${f.answer}`).join('\n\n');
  return `Você é a TriadAI, a camada inteligente entre o cliente e a equipe de suporte da empresa "${tenant.name}" (${tenant.segment}).
Sua função é resolver dúvidas repetitivas usando EXCLUSIVAMENTE a Base de Conhecimento (FAQ) abaixo, ou fazer no máximo 2 turnos de perguntas para organizar e priorizar o chamado para o suporte humano.

=== BASE DE CONHECIMENTO (FAQ) ===
${faqText}
=== FIM DA BASE ===

SETORES CONFIGURADOS PARA ESTE CLIENTE (ADAPTATIVO):
${tenant.sectors.join(' | ')}

METADADOS DA SESSÃO:
- Perguntas de qualificação já feitas: ${session.qualification_turns} (Máximo: 2)
- Chamado já aberto nesta sessão: ${session.ticket_locked} (ID: ${session.ticket_id || 'nenhum'})
- Campo de contexto deste cliente: "${tenant.contextLabel}"

REGRAS:
1. FOCO ESTRITO NO CONTEXTO DO CLIENTE: Você atende EXCLUSIVAMENTE assuntos ligados à empresa "${tenant.name}" (${tenant.segment}) e aos seus setores (${tenant.sectors.join(', ')}). Se o usuário perguntar algo fora desse contexto (ex.: receitas, futebol, piadas, programação, assuntos gerais ou pessoais), NÃO responda ao assunto fora de escopo e NÃO abra chamado; recuse educadamente dizendo que só atende questões da "${tenant.name}" e pergunte como ajudar dentro desse atendimento ("acao": "continuar_chat", "fez_pergunta_qualificacao": false).
2. Nunca invente informações fora da FAQ. Se não estiver na FAQ (e for assunto da empresa), qualifique para abrir chamado.
3. Se estiver na FAQ: responda com passos claros, termine perguntando "Esse procedimento resolveu o seu problema?" e retorne "acao": "propor_faq".
4. Para abrir chamado: colete problema exato, solicitante e o campo "${tenant.contextLabel}" em no máximo 2 turnos ("acao": "continuar_chat", "fez_pergunta_qualificacao": true).
5. PERGUNTAR CONFORME O CONTEXTO (INCLUSIVE EM EMERGÊNCIAS): Mesmo em casos graves (ex.: "caiu a internet do bairro todo", "rompeu cabo", "fraude"), se o cliente ainda NÃO informou o local/bairro/endereço exato ou quem é o solicitante, faça 1 pergunta rápida e objetiva para coletar esses dados essenciais antes de abrir o chamado. Só abra direto se o cliente já tiver informado tudo na mesma mensagem.
6. ANTI-LOOP: Se qualification_turns >= 2, abra o chamado imediatamente ("acao": "abrir_ticket").
7. PRIORIDADE ALTA: Queda total, problema em todo o bairro/região, fraude, cobrança dupla, risco físico ou urgência crítica devem ser abertos com prioridade "Alta".
8. DUPLICIDADE E CONCLUSÃO: Se ticket_locked for true e o cliente avisar que já resolveu, que voltou a funcionar ou pedir para cancelar/fechar o chamado, retorne "acao": "concluir_ticket" para encerrar o chamado ativo. Caso contrário, não abra outro ticket.

Responda APENAS em JSON válido:
{
  "resposta_usuario": "Texto natural em português",
  "acao": "propor_faq" | "continuar_chat" | "abrir_ticket" | "concluir_ticket",
  "fonte_faq": "Título da FAQ ou null",
  "fez_pergunta_qualificacao": true ou false,
  "ticket": {
    "abrir": true ou false,
    "concluir": true ou false,
    "titulo": "Resumo curto de até 6 palavras ou null",
    "setor": "Um dos setores configurados acima ou null",
    "prioridade": "Baixa" | "Media" | "Alta" | null,
    "dados_coletados": {
      "solicitante": "Nome/identificação ou 'Não informado pelo cliente'",
      "local_ou_servico": "Valor específico para ${tenant.contextLabel} ou 'Não informado pelo cliente'"
    },
    "resumo_tecnico": "Resumo objetivo para o atendente ou null"
  }
}`;
}

function sanitizeDecision(tenant, parsed) {
  if (parsed.ticket && parsed.ticket.abrir) {
    if (!tenant.sectors.includes(parsed.ticket.setor)) {
      parsed.ticket.setor = tenant.defaultSector;
    }
    if (!['Baixa', 'Media', 'Alta'].includes(parsed.ticket.prioridade)) {
      parsed.ticket.prioridade = 'Media';
    }
  }
  return parsed;
}

async function runGeminiEngine(tenant, session, message) {
  const systemPrompt = buildSystemPrompt(tenant, session);
  const contents = [
    ...session.messages.slice(-10).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    })),
    { role: 'user', parts: [{ text: message }] }
  ];

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 700,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini HTTP ${response.status}: ${errText.slice(0, 120)}`);
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Resposta vazia do Gemini');
  return sanitizeDecision(tenant, JSON.parse(text));
}

async function runGroqEngine(tenant, session, message) {
  const systemPrompt = buildSystemPrompt(tenant, session);
  const history = session.messages.slice(-10).map((m) => ({
    role: m.role,
    content: m.content
  }));

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: message }]
    })
  });

  if (!response.ok) throw new Error(`Groq HTTP ${response.status}`);
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  return sanitizeDecision(tenant, JSON.parse(content));
}

function createTicketFromDecision(tenantState, session, ticketData) {
  const id = `CHM-${String(tenantState.ticketSeq++).padStart(3, '0')}`;
  const ticket = {
    id,
    session_id: session.session_id,
    criado_em: new Date().toISOString(),
    status: 'Aberto',
    titulo: ticketData.titulo || 'Solicitação de suporte',
    setor: ticketData.setor || TENANTS[session.tenant_id].defaultSector,
    prioridade: ticketData.prioridade || 'Media',
    dados_coletados: {
      solicitante: ticketData.dados_coletados?.solicitante || 'Não informado pelo cliente',
      local_ou_servico: ticketData.dados_coletados?.local_ou_servico || 'Não informado pelo cliente'
    },
    resumo_tecnico: ticketData.resumo_tecnico || 'Chamado encaminhado pela triagem inteligente.'
  };
  tenantState.tickets.push(ticket);
  tenantState.tickets = sortTickets(tenantState.tickets);
  tenantState.metrics.tickets_abertos += 1;
  session.ticket_locked = true;
  session.ticket_id = id;
  session.estado = 'TICKET_ABERTO';
  recalcMetrics(tenantState);
  return ticket;
}

function seedDemoTickets(tenantId) {
  const tenant = TENANTS[tenantId];
  const tState = store[tenantId];
  const samples = {
    l3telecom: [
      {
        titulo: 'Rompimento de fibra na Av. Brasil',
        setor: 'Visitas / Campo',
        prioridade: 'Alta',
        solicitante: 'Mercado Bom Preço (CNPJ 12.345...)',
        local_ou_servico: 'Link Dedicado 1GB — Centro',
        resumo_tecnico: 'Queda total de sinal afetando operação comercial; luz LOS vermelha no equipamento.'
      },
      {
        titulo: 'Oscilação e perda de pacotes à noite',
        setor: 'Suporte Técnico',
        prioridade: 'Media',
        solicitante: 'Mariana Costa',
        local_ou_servico: 'Plano Fibra 500MB — Jd. Europa',
        resumo_tecnico: 'Cliente relata lentidão severa após as 19h; roteador com LEDs normais.'
      },
      {
        titulo: 'Alteração de data de vencimento',
        setor: 'Financeiro',
        prioridade: 'Baixa',
        solicitante: 'Carlos Henrique',
        local_ou_servico: 'Contrato #9821',
        resumo_tecnico: 'Solicita mudança do vencimento da fatura do dia 05 para o dia 15.'
      }
    ],
    clinica: [
      {
        titulo: 'Laudo liberado com dados de outro paciente',
        setor: 'Recepção Digital',
        prioridade: 'Alta',
        solicitante: 'Ana Paula Mendes',
        local_ou_servico: 'Protocolo #CV-9042 — Hemograma',
        resumo_tecnico: 'Paciente abriu o resultado no portal e identificou divergência de dados no PDF; bloqueio imediato do link.'
      },
      {
        titulo: 'Dúvida sobre jejum e medicação contínua',
        setor: 'Triagem / Enfermagem',
        prioridade: 'Media',
        solicitante: 'Fernanda Lima',
        local_ou_servico: 'Exame Cortisol — Amanhã 08h',
        resumo_tecnico: 'Paciente precisa confirmar se pode tomar medicação contínua antes da coleta.'
      },
      {
        titulo: 'Solicitação de ajuste no recibo do convênio',
        setor: 'Financeiro',
        prioridade: 'Baixa',
        solicitante: 'Roberto Alves',
        local_ou_servico: 'Consulta Cardiologia — Telemedicina',
        resumo_tecnico: 'Solicita correção do CNPJ do plano de saúde na nota fiscal emitida.'
      }
    ],
    veloce: [
      {
        titulo: 'Cobrança duplicada e conta bloqueada',
        setor: 'Financeiro',
        prioridade: 'Alta',
        solicitante: 'Juliana Martins',
        local_ou_servico: 'Pedido #VEL-8831',
        resumo_tecnico: 'Cliente relata duas cobranças no cartão e bloqueio preventivo de acesso.'
      },
      {
        titulo: 'Produto chegou com avaria na caixa',
        setor: 'Trocas e Garantias',
        prioridade: 'Media',
        solicitante: 'Lucas Pereira',
        local_ou_servico: 'Pedido #VEL-8710',
        resumo_tecnico: 'Embalagem amassada na entrega e equipamento não liga; deseja troca.'
      },
      {
        titulo: 'Atualização de endereço para próxima compra',
        setor: 'Logística / Entregas',
        prioridade: 'Baixa',
        solicitante: 'Patrícia Souza',
        local_ou_servico: 'Cadastro cliente',
        resumo_tecnico: 'Dúvida cadastral fora da FAQ sobre alteração de CEP padrão.'
      }
    ]
  };

  const list = samples[tenantId] || [];
  for (const s of list) {
    const id = `CHM-${String(tState.ticketSeq++).padStart(3, '0')}`;
    tState.tickets.push({
      id,
      session_id: `seed_${id}`,
      criado_em: new Date().toISOString(),
      status: 'Aberto',
      titulo: s.titulo,
      setor: tenant.sectors.includes(s.setor) ? s.setor : tenant.defaultSector,
      prioridade: s.prioridade,
      dados_coletados: {
        solicitante: s.solicitante,
        local_ou_servico: s.local_ou_servico
      },
      resumo_tecnico: s.resumo_tecnico
    });
    tState.metrics.tickets_abertos += 1;
    tState.metrics.total_atendimentos += 1;
  }
  tState.metrics.chamados_evitados += 4;
  tState.metrics.total_atendimentos += 4;
  tState.metrics.minutos_economizados += 40;
  tState.tickets = sortTickets(tState.tickets);
  recalcMetrics(tState);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) reject(new Error('Payload too large'));
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function serveStatic(req, res, urlPath) {
  const safePath = urlPath === '/' ? '/index.html' : urlPath;
  const fullPath = path.join(PUBLIC_DIR, safePath);
  if (!fullPath.startsWith(PUBLIC_DIR) || !fs.existsSync(fullPath)) {
    res.writeHead(404);
    return res.end('Not found');
  }
  const ext = path.extname(fullPath).toLowerCase();
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  }[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(fullPath).pipe(res);
}

const activeMode = GEMINI_API_KEY
  ? 'gemini'
  : GROQ_API_KEY
  ? 'groq'
  : 'contingencia';

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === 'GET' && url.pathname === '/api/tenants') {
      const list = Object.values(TENANTS).map((t) => ({
        id: t.id,
        name: t.name,
        channelName: t.channelName,
        segment: t.segment,
        channelMode: t.channelMode,
        contextLabel: t.contextLabel,
        sectors: t.sectors,
        quickPrompts: t.quickPrompts,
        faq: t.faq.map((f) => ({ title: f.title, sector: f.sector, answer: f.answer }))
      }));
      return sendJson(res, 200, {
        mode: activeMode,
        model: activeMode === 'gemini' ? GEMINI_MODEL : activeMode === 'groq' ? 'llama-3.3-70b' : 'local',
        tenants: list
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/dashboard') {
      const tenantId = url.searchParams.get('tenant') || 'l3telecom';
      const tState = store[tenantId] || store.l3telecom;
      return sendJson(res, 200, {
        metrics: tState.metrics,
        tickets: sortTickets(tState.tickets)
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const body = await readJsonBody(req);
      const tenantId = TENANTS[body.tenant_id] ? body.tenant_id : 'l3telecom';
      const tenant = TENANTS[tenantId];
      const tState = store[tenantId];
      const sessionId = body.session_id || `sess_${Date.now()}`;
      const message = String(body.message || '').trim();
      if (!message) return sendJson(res, 400, { error: 'Mensagem vazia' });

      const session = getOrCreateSession(tenantId, sessionId);

      // If human agent took over, chatbot stays OFF
      if (session.human_takeover) {
        session.messages.push({ role: 'user', content: message });
        return sendJson(res, 200, {
          session_id: sessionId,
          estado_sessao: 'ATENDIMENTO_HUMANO',
          human_takeover: true,
          resposta_usuario: null,
          acao: 'humano_ativo',
          fonte_faq: null,
          ticket: null,
          ticket_updated: false,
          metrics: tState.metrics,
          engine: 'humano'
        });
      }

      if (!session.counted) {
        tState.metrics.total_atendimentos += 1;
        session.counted = true;
        recalcMetrics(tState);
      }

      let decision;
      let engineUsed = 'contingencia';

      if (GEMINI_API_KEY) {
        try {
          decision = await runGeminiEngine(tenant, session, message);
          engineUsed = 'gemini';
        } catch (err) {
          console.warn('Gemini fallback:', err.message);
          decision = runLocalEngine(tenant, session, message);
        }
      } else if (GROQ_API_KEY) {
        try {
          decision = await runGroqEngine(tenant, session, message);
          engineUsed = 'groq';
        } catch (err) {
          console.warn('Groq fallback:', err.message);
          decision = runLocalEngine(tenant, session, message);
        }
      } else {
        decision = runLocalEngine(tenant, session, message);
      }

      session.messages.push({ role: 'user', content: message });
      session.messages.push({ role: 'assistant', content: decision.resposta_usuario });

      if (decision.fez_pergunta_qualificacao) {
        session.qualification_turns += 1;
        session.estado = 'EM_QUALIFICACAO';
      } else if (decision.acao === 'propor_faq') {
        session.estado = 'AGUARDANDO_CONFIRMACAO_FAQ';
      }

      let createdTicket = null;
      let ticketUpdated = false;
      if (decision.acao === 'abrir_ticket' && decision.ticket?.abrir && !session.ticket_locked) {
        createdTicket = createTicketFromDecision(tState, session, decision.ticket);
      } else if (
        (decision.acao === 'concluir_ticket' || decision.ticket?.concluir) &&
        session.ticket_id
      ) {
        const existing = tState.tickets.find((t) => t.id === session.ticket_id);
        if (existing && existing.status !== 'Concluido') {
          existing.status = 'Concluido';
          existing.resumo_tecnico += ' [Concluído pelo próprio cliente via IA]';
          tState.tickets = sortTickets(tState.tickets);
          session.estado = 'ENCERRADA_PELO_CLIENTE';
          ticketUpdated = true;
        }
      }

      return sendJson(res, 200, {
        session_id: sessionId,
        estado_sessao: session.estado,
        resposta_usuario: decision.resposta_usuario,
        acao: decision.acao,
        fonte_faq: decision.fonte_faq || null,
        ticket: createdTicket,
        ticket_updated: ticketUpdated,
        metrics: tState.metrics,
        engine: engineUsed
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/feedback') {
      const body = await readJsonBody(req);
      const tenantId = TENANTS[body.tenant_id] ? body.tenant_id : 'l3telecom';
      const tenant = TENANTS[tenantId];
      const tState = store[tenantId];
      const session = getOrCreateSession(tenantId, body.session_id);

      if (body.resolved) {
        if (session.estado !== 'ENCERRADA_DEFLEXAO') {
          session.estado = 'ENCERRADA_DEFLEXAO';
          tState.metrics.chamados_evitados += 1;
          tState.metrics.minutos_economizados += 10;
          recalcMetrics(tState);
        }
        return sendJson(res, 200, {
          estado_sessao: session.estado,
          resposta_usuario: 'Perfeito! Atendimento resolvido na hora sem precisar abrir fila. Se precisar de mais algo, é só chamar!',
          metrics: tState.metrics
        });
      }

      session.estado = 'EM_QUALIFICACAO';
      session.messages.push({
        role: 'user',
        content: 'O procedimento da FAQ não resolveu o meu problema.'
      });
      session.qualification_turns += 1;
      session.messages.push({ role: 'assistant', content: tenant.qualifyPrompt });

      return sendJson(res, 200, {
        estado_sessao: session.estado,
        resposta_usuario: tenant.qualifyPrompt,
        metrics: tState.metrics
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/seed') {
      const body = await readJsonBody(req);
      const tenantId = TENANTS[body.tenant_id] ? body.tenant_id : 'l3telecom';
      seedDemoTickets(tenantId);
      return sendJson(res, 200, {
        metrics: store[tenantId].metrics,
        tickets: sortTickets(store[tenantId].tickets)
      });
    }

    if (req.method === 'PATCH' && url.pathname.startsWith('/api/tickets/')) {
      const ticketId = url.pathname.split('/').pop();
      const body = await readJsonBody(req);
      const tenantId = TENANTS[body.tenant_id] ? body.tenant_id : 'l3telecom';
      const tState = store[tenantId];
      const ticket = tState.tickets.find((t) => t.id === ticketId);
      if (!ticket) return sendJson(res, 404, { error: 'Chamado não encontrado' });
      const allowed = ['Aberto', 'Em Atendimento', 'Concluido'];
      ticket.status = allowed.includes(body.status) ? body.status : 'Aberto';
      if (ticket.session_id && tState.sessions[ticket.session_id]) {
        const sess = tState.sessions[ticket.session_id];
        if (body.status === 'Em Atendimento') {
          sess.human_takeover = true;
          sess.estado = 'ATENDIMENTO_HUMANO';
          sess.agent_outbox.push(
            `Atendente de ${TENANTS[tenantId].name} (${ticket.setor}) assumiu o chamado #${ticket.id}. O chatbot foi pausado.`
          );
        } else if (body.status === 'Concluido') {
          // Reset session from scratch so the bot starts fresh on next message
          sess.human_takeover = false;
          sess.estado = 'INICIADA';
          sess.qualification_turns = 0;
          sess.pending_priority = null;
          sess.ticket_locked = false;
          sess.ticket_id = null;
          sess.counted = false;
          sess.messages = [];
          sess.collected = { problema: null, solicitante: null, local_ou_servico: null };
          sess.agent_outbox.push(
            `Atendimento #${ticket.id} finalizado pela equipe! O assistente TriadAI voltou a funcionar do zero para um novo atendimento.`
          );
        }
      }
      tState.tickets = sortTickets(tState.tickets);
      return sendJson(res, 200, { ticket });
    }

    if (req.method === 'POST' && url.pathname.match(/^\/api\/tickets\/[^/]+\/message$/)) {
      const parts = url.pathname.split('/');
      const ticketId = parts[3];
      const body = await readJsonBody(req);
      const tenantId = TENANTS[body.tenant_id] ? body.tenant_id : 'l3telecom';
      const tState = store[tenantId];
      const ticket = tState.tickets.find((t) => t.id === ticketId);
      if (!ticket) return sendJson(res, 404, { error: 'Chamado não encontrado' });
      const text = String(body.message || '').trim();
      if (!text) return sendJson(res, 400, { error: 'Mensagem vazia' });
      if (ticket.status === 'Aberto') ticket.status = 'Em Atendimento';
      const sess = tState.sessions[ticket.session_id];
      if (sess) {
        sess.agent_outbox.push(`Suporte (${ticket.setor}): ${text}`);
      }
      tState.tickets = sortTickets(tState.tickets);
      return sendJson(res, 200, { ok: true, ticket });
    }

    if (req.method === 'GET' && url.pathname === '/api/session/messages') {
      const tenantId = url.searchParams.get('tenant') || 'l3telecom';
      const sid = url.searchParams.get('session_id') || '';
      const tState = store[tenantId];
      const sess = tState?.sessions?.[sid];
      if (!sess) return sendJson(res, 200, { messages: [] });
      const msgs = [...sess.agent_outbox];
      sess.agent_outbox = [];
      return sendJson(res, 200, { messages: msgs });
    }

    if (req.method === 'POST' && url.pathname === '/api/reset') {
      const body = await readJsonBody(req);
      const tenantId = TENANTS[body.tenant_id] ? body.tenant_id : 'l3telecom';
      store[tenantId] = {
        sessions: {},
        tickets: [],
        ticketSeq: 1,
        metrics: {
          total_atendimentos: 0,
          chamados_evitados: 0,
          tickets_abertos: 0,
          taxa_deflexao_percentual: 0,
          minutos_economizados: 0
        }
      };
      return sendJson(res, 200, { ok: true, metrics: store[tenantId].metrics });
    }

    if (req.method === 'GET') {
      return serveStatic(req, res, url.pathname);
    }

    res.writeHead(405);
    res.end('Method not allowed');
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`TriadAI MVP rodando em http://localhost:${PORT}`);
  console.log(`Motor ativo: ${activeMode}`);
});
