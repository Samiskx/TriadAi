# TriadAI

**Triagem inteligente. Suporte sem fila.**

A **TriadAI** é uma camada intermediária de Inteligência Artificial entre o cliente final e a equipe de suporte. Implantada nos canais que a empresa já utiliza (como WhatsApp e chat) ou em um canal próprio personalizado, ela resolve dúvidas repetitivas na hora e organiza os problemas reais por **prioridade** e **setor** adaptado ao cliente.

## Funcionalidades do MVP

- **Deflexão imediata:** responde dúvidas recorrentes usando exclusivamente a base oficial do cliente, sem inventar procedimentos.
- **Triagem estruturada em poucos turnos:** coleta identificação e contexto específico (como `Plano / Endereço`, `Exame / Unidade` ou `Pedido / Produto`) antes de abrir o chamado.
- **Organização automática por prioridade:** ordena a fila em **Alta → Média → Baixa** e adapta os setores para cada empresa (`L3 Telecom`, `Clínica Vida`, `Veloce Store`).
- **Transbordo humano (*Human Handoff*):** quando o suporte aceita o chamado e entra em contato, o chatbot desliga automaticamente; ao concluir o atendimento, o bot reinicia do zero para um novo chat.
- **Motor de IA flexível:** suporte nativo à API do **Google Gemini (`gemini-3.5-flash-lite`)**, **Groq (`llama-3.3-70b`)** e **Modo Contingência Local** (funciona mesmo offline).

## Como executar localmente

1. Copie `.env.example` para `.env` e adicione sua chave do Gemini (opcional):
   ```env
   GEMINI_API_KEY=sua_chave_aqui
   PORT=3000
   ```
   *(Sem chave configurada, o sistema inicia automaticamente no Modo Contingência Local.)*

2. Inicie o servidor (requer Node.js 18+, sem dependências externas):
   ```bash
   npm start
   ```

3. Acesse `http://localhost:3000` no navegador.

## Estrutura

- `server.js` — servidor HTTP, API REST, integração Gemini/Groq e motor de contingência
- `tenants.js` — cenários adaptativos (`l3telecom`, `clinica`, `veloce`)
- `public/` — interface web + simulador de canal do cliente e painel do suporte
- `docs/` — especificação do projeto (`TriadAi.txt`) e slides (`Matriz SWOT e Canvas Mini Produto Digital - TriadAI.pptx`)

## Equipe

- **Savyo Vyctor** & **Thiago Neiva** — *Ferramentas de I.A e Chatbot*
