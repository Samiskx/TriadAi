let tenants = [];
let activeTenant = null;
let sessionId = createSessionId();
let currentFilter = 'ALL';
let cachedTickets = [];

function createSessionId() {
  return 'sess_' + Math.random().toString(36).slice(2, 10);
}

const el = {
  engineBadge: document.getElementById('engineBadge'),
  tenantTabs: document.getElementById('tenantTabs'),
  tenantInfo: document.getElementById('tenantInfo'),
  waAvatar: document.getElementById('waAvatar'),
  waChannelName: document.getElementById('waChannelName'),
  waChannelMode: document.getElementById('waChannelMode'),
  quickPrompts: document.getElementById('quickPrompts'),
  chatMessages: document.getElementById('chatMessages'),
  chatForm: document.getElementById('chatForm'),
  chatInput: document.getElementById('chatInput'),
  sendBtn: document.getElementById('sendBtn'),
  newChatBtn: document.getElementById('newChatBtn'),
  resetDemoBtn: document.getElementById('resetDemoBtn'),
  seedBtn: document.getElementById('seedBtn'),
  faqBtn: document.getElementById('faqBtn'),
  faqModal: document.getElementById('faqModal'),
  faqModalTitle: document.getElementById('faqModalTitle'),
  faqModalBody: document.getElementById('faqModalBody'),
  closeFaqBtn: document.getElementById('closeFaqBtn'),
  kpiDeflected: document.getElementById('kpiDeflected'),
  kpiDeflectionPct: document.getElementById('kpiDeflectionPct'),
  kpiTickets: document.getElementById('kpiTickets'),
  kpiMinutes: document.getElementById('kpiMinutes'),
  ticketsFeed: document.getElementById('ticketsFeed'),
  pipeStep3Text: document.getElementById('pipeStep3Text')
};

function setPipeline(activeStep, step3Label = 'Deflexão ou Triagem') {
  el.pipeStep3Text.textContent = step3Label;
  document.querySelectorAll('.pipe-step').forEach((node) => {
    const s = Number(node.dataset.step);
    node.classList.toggle('active', s <= activeStep);
  });
}

async function init() {
  const res = await fetch('/api/tenants');
  const data = await res.json();
  tenants = data.tenants;

  if (data.mode === 'gemini') {
    el.engineBadge.textContent = `IA: Gemini (${data.model})`;
  } else if (data.mode === 'groq') {
    el.engineBadge.textContent = 'IA: Groq (Llama 3.3)';
  } else {
    el.engineBadge.textContent = 'IA: Contingência Local';
  }

  renderTenantTabs();
  selectTenant(tenants[0].id);

  el.chatForm.addEventListener('submit', onSubmitChat);
  el.newChatBtn.addEventListener('click', startNewConversation);
  el.resetDemoBtn.addEventListener('click', resetTenantDemo);
  el.seedBtn.addEventListener('click', seedQueue);
  el.faqBtn.addEventListener('click', openFaqModal);
  el.closeFaqBtn.addEventListener('click', () => el.faqModal.classList.add('hidden'));
  el.faqModal.addEventListener('click', (e) => {
    if (e.target === el.faqModal) el.faqModal.classList.add('hidden');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') el.faqModal.classList.add('hidden');
  });

  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.priority;
      renderTickets(cachedTickets);
    });
  });
}

function renderTenantTabs() {
  el.tenantTabs.innerHTML = '';
  tenants.forEach((t) => {
    const btn = document.createElement('button');
    btn.className = 'tenant-tab';
    btn.textContent = t.name;
    btn.dataset.id = t.id;
    btn.addEventListener('click', () => selectTenant(t.id));
    el.tenantTabs.appendChild(btn);
  });
}

async function selectTenant(tenantId) {
  activeTenant = tenants.find((t) => t.id === tenantId);
  document.querySelectorAll('.tenant-tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.id === tenantId);
  });

  el.waAvatar.textContent = activeTenant.name.slice(0, 2).toUpperCase();
  el.waChannelName.textContent = activeTenant.channelName;
  el.waChannelMode.textContent = `${activeTenant.channelMode} · TriadAI ativo`;

  const pills = activeTenant.sectors.map((s) => `<span class="sector-pill">${s}</span>`).join('');
  el.tenantInfo.innerHTML = `<span style="color:var(--muted);">Setores:</span>${pills}`;

  renderQuickPrompts();
  startNewConversation();
  await refreshDashboard();
}

function renderQuickPrompts() {
  el.quickPrompts.innerHTML = '';
  activeTenant.quickPrompts.forEach((q) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quick-btn';
    btn.textContent = q.label;
    btn.addEventListener('click', () => sendMessage(q.text));
    el.quickPrompts.appendChild(btn);
  });
}

function startNewConversation() {
  sessionId = createSessionId();
  el.chatMessages.innerHTML = '';
  setPipeline(1);
  appendBotMessage(
    `Olá! Você está no atendimento da ${activeTenant.name}. Me conte sua dúvida ou problema que eu resolvo na hora ou encaminho já priorizado para o setor certo.`
  );
}

function appendUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'msg user';
  div.textContent = text;
  el.chatMessages.appendChild(div);
  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

function appendBotMessage(text, options = {}) {
  const div = document.createElement('div');
  div.className = options.isAgent ? 'msg bot agent-msg' : 'msg bot';
  div.textContent = text;

  if (options.fonte_faq) {
    const src = document.createElement('div');
    src.className = 'msg-source';
    src.textContent = `Base oficial: ${options.fonte_faq}`;
    div.appendChild(src);
  }

  if (options.showFeedback) {
    const actions = document.createElement('div');
    actions.className = 'feedback-actions';

    const yesBtn = document.createElement('button');
    yesBtn.type = 'button';
    yesBtn.className = 'fb-btn fb-yes';
    yesBtn.textContent = '✔ Sim, resolveu';
    yesBtn.addEventListener('click', () => sendFeedback(true, actions));

    const noBtn = document.createElement('button');
    noBtn.type = 'button';
    noBtn.className = 'fb-btn fb-no';
    noBtn.textContent = '✖ Não resolveu, falar com suporte';
    noBtn.addEventListener('click', () => sendFeedback(false, actions));

    actions.appendChild(yesBtn);
    actions.appendChild(noBtn);
    div.appendChild(actions);
  }

  el.chatMessages.appendChild(div);
  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

async function onSubmitChat(e) {
  e.preventDefault();
  const text = el.chatInput.value.trim();
  if (!text) return;
  el.chatInput.value = '';
  await sendMessage(text);
}

async function sendMessage(text) {
  appendUserMessage(text);
  el.sendBtn.disabled = true;
  el.sendBtn.textContent = '...';
  setPipeline(2);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: activeTenant.id,
        session_id: sessionId,
        message: text
      })
    });
    const data = await res.json();

    if (data.human_takeover) {
      el.waChannelMode.textContent = 'Atendimento humano ativo · Bot desligado';
      setPipeline(4, 'Em atendimento humano');
      return;
    }

    if (data.acao === 'propor_faq') {
      setPipeline(3, 'Deflexão via Base Oficial');
    } else if (data.acao === 'continuar_chat') {
      setPipeline(3, 'Qualificação em andamento');
    } else if (data.acao === 'abrir_ticket') {
      setPipeline(4, 'Chamado estruturado');
    } else if (data.acao === 'concluir_ticket') {
      setPipeline(4, 'Chamado concluído via IA');
    }

    if (data.resposta_usuario) {
      appendBotMessage(data.resposta_usuario, {
        fonte_faq: data.fonte_faq,
        showFeedback: data.acao === 'propor_faq'
      });
    }
    updateKPIs(data.metrics);
    if (data.ticket || data.ticket_updated) {
      await refreshDashboard();
    }
  } catch (err) {
    appendBotMessage('Erro de conexão ao processar mensagem.');
  } finally {
    el.sendBtn.disabled = false;
    el.sendBtn.textContent = 'Enviar';
  }
}

async function sendFeedback(resolved, actionsContainer) {
  actionsContainer.remove();
  appendUserMessage(resolved ? 'Sim, resolveu!' : 'Não resolveu, preciso de suporte.');

  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant_id: activeTenant.id,
      session_id: sessionId,
      resolved
    })
  });
  const data = await res.json();
  setPipeline(3, resolved ? 'Deflexão confirmada!' : 'Coletando dados para chamado');
  appendBotMessage(data.resposta_usuario);
  updateKPIs(data.metrics);
}

async function seedQueue() {
  const res = await fetch('/api/seed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: activeTenant.id })
  });
  const data = await res.json();
  updateKPIs(data.metrics);
  cachedTickets = data.tickets;
  renderTickets(cachedTickets);
  setPipeline(4, 'Fila organizada por prioridade');
}

async function refreshDashboard() {
  const res = await fetch(`/api/dashboard?tenant=${activeTenant.id}`);
  const data = await res.json();
  updateKPIs(data.metrics);
  cachedTickets = data.tickets;
  renderTickets(cachedTickets);
}

function updateKPIs(metrics) {
  if (!metrics) return;
  el.kpiDeflected.textContent = metrics.chamados_evitados;
  el.kpiDeflectionPct.textContent = `${metrics.taxa_deflexao_percentual}%`;
  el.kpiTickets.textContent = metrics.tickets_abertos;
  el.kpiMinutes.textContent = `${metrics.minutos_economizados} min`;
}

async function pullAgentMessages() {
  if (!activeTenant || !sessionId) return;
  const res = await fetch(
    `/api/session/messages?tenant=${activeTenant.id}&session_id=${encodeURIComponent(sessionId)}`
  );
  const data = await res.json();
  if (Array.isArray(data.messages)) {
    data.messages.forEach((m) => appendBotMessage(m, { isAgent: true }));
  }
}

function renderTickets(tickets) {
  const filtered =
    currentFilter === 'ALL'
      ? tickets
      : tickets.filter((t) => t.prioridade === currentFilter);

  if (filtered.length === 0) {
    el.ticketsFeed.innerHTML = `
      <div class="empty-state">
        Nenhum chamado na fila de <strong>${activeTenant.name}</strong>.<br />
        Envie uma mensagem ao lado ou clique em <strong>Simular fila cheia</strong> para ver a priorização em ação.
      </div>
    `;
    return;
  }

  el.ticketsFeed.innerHTML = '';
  filtered.forEach((t) => {
    const card = document.createElement('div');
    const isDone = t.status === 'Concluido';
    const isInProgress = t.status === 'Em Atendimento';
    card.className = `ticket-card prio-${t.prioridade} ${isDone ? 'done' : ''}`;
    const time = new Date(t.criado_em).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const statusBadge = isInProgress
      ? '<span class="status-pill active">EM ATENDIMENTO</span>'
      : isDone
      ? '<span class="status-pill closed">CONCLUÍDO</span>'
      : '<span class="status-pill open">AGUARDANDO</span>';

    card.innerHTML = `
      <div class="ticket-top">
        <span class="prio-pill ${t.prioridade}">${t.prioridade.toUpperCase()}</span>
        <span class="ticket-id">#${t.id}</span>
        <span class="ticket-sector">${t.setor}</span>
        ${statusBadge}
        <span style="margin-left:auto;color:var(--muted);">${time}</span>
      </div>
      <div class="ticket-title">${t.titulo}</div>
      <div class="ticket-meta">
        <div><strong>Solicitante:</strong> ${t.dados_coletados.solicitante}</div>
        <div><strong>${activeTenant.contextLabel || 'Contexto'}:</strong> ${t.dados_coletados.local_ou_servico}</div>
      </div>
      <div class="ticket-summary">${t.resumo_tecnico}</div>
      ${
        isInProgress
          ? `<div class="agent-reply-box">
               <input type="text" class="agent-reply-input" placeholder="Enviar mensagem direta para o cliente no chat..." />
               <button type="button" class="agent-send-btn">Enviar ao cliente</button>
             </div>`
          : ''
      }
      <div class="ticket-actions">
        ${
          t.status === 'Aberto'
            ? '<button class="accept-btn">Aceitar e Entrar em Contato</button>'
            : ''
        }
        <button class="done-btn">${isDone ? 'Reabrir' : 'Concluir Chamado'}</button>
      </div>
    `;

    const acceptBtn = card.querySelector('.accept-btn');
    if (acceptBtn) {
      acceptBtn.addEventListener('click', async () => {
        await fetch(`/api/tickets/${t.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant_id: activeTenant.id, status: 'Em Atendimento' })
        });
        el.waChannelMode.textContent = 'Atendimento humano ativo · Bot desligado';
        await refreshDashboard();
        await pullAgentMessages();
      });
    }

    const sendAgentBtn = card.querySelector('.agent-send-btn');
    const agentInput = card.querySelector('.agent-reply-input');
    if (sendAgentBtn && agentInput) {
      const sendReply = async () => {
        const msg = agentInput.value.trim();
        if (!msg) return;
        agentInput.value = '';
        await fetch(`/api/tickets/${t.id}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant_id: activeTenant.id, message: msg })
        });
        await pullAgentMessages();
      };
      sendAgentBtn.addEventListener('click', sendReply);
      agentInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendReply();
        }
      });
    }

    card.querySelector('.done-btn').addEventListener('click', async () => {
      const nextStatus = isDone ? 'Aberto' : 'Concluido';
      await fetch(`/api/tickets/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: activeTenant.id, status: nextStatus })
      });
      if (nextStatus === 'Concluido') {
        el.waChannelMode.textContent = `${activeTenant.channelMode} · TriadAI ativo`;
        setPipeline(1);
      }
      await refreshDashboard();
      await pullAgentMessages();
    });

    el.ticketsFeed.appendChild(card);
  });
}

function openFaqModal() {
  if (!activeTenant) return;
  el.faqModalTitle.textContent = `Base de Conhecimento — ${activeTenant.name}`;
  el.faqModalBody.innerHTML = '';
  (activeTenant.faq || []).forEach((item) => {
    const card = document.createElement('div');
    card.className = 'faq-item';
    const cleanAnswer = item.answer.replace(/\n\nEsse procedimento resolveu o seu problema\?$/i, '');
    card.innerHTML = `
      <div class="faq-item-head">
        <strong>${item.title}</strong>
        <span class="sector-pill">${item.sector}</span>
      </div>
      <p>${cleanAnswer}</p>
    `;
    el.faqModalBody.appendChild(card);
  });
  el.faqModal.classList.remove('hidden');
}

async function resetTenantDemo() {
  await fetch('/api/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: activeTenant.id })
  });
  startNewConversation();
  await refreshDashboard();
}

init();
