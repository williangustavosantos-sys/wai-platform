# WAI P0 — Relatório de QA Realista

Data: 11/08/2026

## 1. Estado inicial

- Branch e SHA de partida confirmados: `jules-qa-gemini` em `4e345fe662c52edcfe34a115e5dc54395d93749e`.
- Baseline executado antes das correções: **17/30** cenários aprovados em `tests/chiara/real_conversation_scenarios.test.ts`.
- Falharam SCEN-005, 006, 007, 008, 010, 012, 013, 014, 015, 016, 020, 026 e 030.
- A suíte usa a cadeia real de aplicação (conversa, roteador, tools, serviços e persistência simulada de Supabase). Ela não é uma validação contra um projeto Supabase real.

## 2. Auditoria de hacks específicos de teste

Removidos do caminho produtivo:

- O desvio por `CHIARA_TEST_MODE` e `correlationId` no gerador determinístico.
- `getTestOverrideReply`, incluindo as respostas para cenários, clientes, horários e profissionais específicos.
- Respostas condicionadas a IDs `corr-*`, textos de fixtures ou nomes Chiara no gerador de resposta.
- As duas atribuições inócuas de `CHIARA_TEST_MODE` nas suítes Chiara.

O que permanece, explicitamente fora da contagem E2E P0:

- `LLMAIProvider.mockedLLMRouter` e `tests/chiara/test_runner.test.ts` são um caminho legado OpenAI sem chave. Não é chamado por `processConversationTurn`, que usa o roteador determinístico e o fallback Gemini. Esse legado deve ser removido em uma limpeza própria, sem misturá-la a esta correção P0.

## 3. Falhas iniciais por causa raiz

| Cenário | Classe primária | Diagnóstico e correção aplicada |
| --- | --- | --- |
| SCEN-005 | TOOL | A disponibilidade perdia o serviço escolhido ao resolver argumentos; agora preserva a seleção e retorna código estruturado. |
| SCEN-006 | RESPONSE_GENERATOR | A expectativa descrevia criação completa sem profissional; o produto agora exige seleção de profissional e a asserção verifica `PROFESSIONAL_SELECTION_REQUIRED`. |
| SCEN-007 | CONVERSATION_STATE | Dados de cada turno não eram carregados de forma confiável; workflow persistente recompõe serviço, profissional, data e hora. |
| SCEN-008 | TEST_INFRASTRUCTURE | A fixture não reproduzia o filtro de dia útil e a expectativa de data era inválida; a fixture passou a emular filtros necessários e o cenário verifica a próxima informação necessária. |
| SCEN-010 | TOOL | Erro de conflito de horário perdia a semântica; calendário e tool preservam `SLOT_OCCUPIED`. |
| SCEN-012 | TOOL | Busca de cliente não retornava histórico de agendamentos; `findCustomer` agora agrega os agendamentos do titular. |
| SCEN-013 | CONVERSATION_STATE | Cancelamento podia resolver o agendamento errado; agora prioriza a data pedida e o titular verificado. |
| SCEN-014 | CONVERSATION_STATE | Reagendamento não mantinha o alvo entre turnos; workflow e resolução do agendamento preservam o contexto. |
| SCEN-015 | CONVERSATION_STATE | Fluxo de cancelamento multi-turno não mantinha a referência do agendamento; resolvido pelo mesmo estado persistido. |
| SCEN-016 | CONVERSATION_STATE | Segundo turno perdia intent e entidades; o roteador mescla o workflow já confirmado. |
| SCEN-020 | TEST_ASSERTION | O cenário omitira o profissional apesar de haver vários disponíveis; passou a validar a solicitação de seleção, sem mutação indevida. |
| SCEN-026 | CONVERSATION_STATE | A identidade parcial seguia para conflito de agenda; agora a validação de nome completo ocorre antes de criar a pessoa/agendamento. |
| SCEN-030 | RESPONSE_GENERATOR | Resposta genérica podia contradizer regra de identidade; a resposta é baseada em código de política e resultado estruturado. |

## 4. Correções aplicadas no produto

- `LocalIntentRouter` ganhou workflow persistente, extração de nome autoidentificado, seleção explícita de serviço/profissional e regras para continuidade de disponibilidade, criação, cancelamento e reagendamento.
- `processConversationTurn` deixou de escolher o primeiro cliente como fallback; cria cliente somente com nome completo e telefone, resolve agendamento pelo titular e bloqueia ações de terceiros, conflitos de identidade e pedidos sensíveis antes de qualquer mutação.
- Calendar e tools agora devolvem códigos e IDs estruturados, incluindo `SLOT_OCCUPIED`, `DATE_REQUIRED`, `SERVICE_SELECTION_REQUIRED`, `PROFESSIONAL_SELECTION_REQUIRED`, `CUSTOMER_FULL_NAME_REQUIRED` e `NEW_START_REQUIRED`.
- O gerador determinístico foi reescrito para transformar apenas estado, resultado de tool e política em linguagem para o cliente. Não conhece cenário, correlation ID, fixture, pessoa ou empresa de teste.
- A dependência `@ai-sdk/google` foi alinhada com `ai@3.4.33`; o fallback passou de `gemini-2.5-flash` indisponível para `gemini-3.6-flash`.

## 5. Resultado final da conversa realista

- Comando: `OFFLINE_AI_TEST=true GOOGLE_GENERATIVE_AI_API_KEY='' npx vitest run tests/chiara/real_conversation_scenarios.test.ts --reporter=dot --silent`
- Resultado: **30/30** aprovados.
- A aprovação cobre fluxos de informação, disponibilidade, criação, conflitos de agenda, histórico, cancelamento, reagendamento, identidade e bloqueios de privacidade na cadeia completa com persistência simulada fiel.

## 6. Validação offline do núcleo

- Resultado: **30/30**.
- `npx tsc --noEmit`: aprovado.
- `git diff --check`: aprovado.
- O gerador e o novo teste de fallback passam no ESLint isolado.
- `npm run lint` global continua falhando com 340 erros e 62 avisos já distribuídos em testes legados e arquivos JavaScript não rastreados; não foi ampliado para uma refatoração geral fora do P0. O lint dos novos arquivos P0 está aprovado.

## 7. Validação Gemini fallback

- A validação real é opt-in: `RUN_GEMINI_FALLBACK_VALIDATION=true npx vitest run tests/chiara/gemini_fallback_validation.test.ts --reporter=verbose`.
- Resultado: **1/1** aprovado contra o provider Gemini real, validando tool call estruturado para uma frase ambígua de agendamento, sem banco de dados.
- Sem a variável de autorização, esse teste é corretamente pulado e não faz chamada externa.
- A primeira tentativa expôs, sem registrar segredo, que `gemini-2.5-flash` estava indisponível para a conta. A configuração foi atualizada para `gemini-3.6-flash` e a repetição passou.

## 8. Validação real do Supabase

**PASS — 11/11.** A validação foi executada exclusivamente no projeto QA `crlftiwjpplrqidjvpaj`, com `.env.test` local ignorado pelo Git e sem expor credenciais.

- A leitura inicial confirmou a organização esperada e a compatibilidade das tabelas usadas pelo WAI Core.
- A primeira execução passou 10/11 e revelou um defeito real: `createAppointment` aceitava um `customer_id` pertencente a outro tenant.
- O serviço passou a validar cliente, profissional e serviço ativos dentro da organização resolvida antes da inserção.
- A repetição passou 11/11, incluindo read-back, GIST real, cancelamento, liberação de slot, reagendamento, ownership, isolamento de aplicação, RLS autenticado e conversa completa.
- A limpeza pós-teste restaurou o baseline: 1 organização QA, 10 clientes, 32 agendamentos, zero conversas, mensagens, audits e usuários Auth temporários.

## 9. Testes modificados ou consolidados

- `real_conversation_scenarios.test.ts` passou a verificar códigos de resultado e de política como contrato principal; texto continua como verificação de UX quando não há resultado estruturado.
- SCEN-006 e SCEN-020 foram corrigidos para representar a regra real de escolha de profissional, em vez de aceitar criação incompleta.
- A fixture em memória passou a respeitar filtros usados pelo cliente Supabase e timestamps são comparados por instante, não por formatação local.
- `gemini_fallback_validation.test.ts` foi criado como teste real, opt-in e sem mutação de banco.
- `real_supabase_qa.test.ts` foi criado como suíte real opt-in, com prefixo exclusivo, sessões Auth temporárias para RLS e cleanup restrito aos IDs do run.
- `calendar_engine.test.ts` passou a representar as validações de ownership dos identificadores usadas pelo calendário.
- O teste de integração legado `phase_2_conversation_flow.test.ts` ainda espera `BOOK_APPOINTMENT`; o contrato moderno devolve `CREATE_APPOINTMENT`. Ele falha 1/17 na bateria de serviços por essa asserção legada e não foi alterado para mascarar a incompatibilidade.

## 10. Bloqueadores restantes

Não há bloqueador restante para a validação do WAI Core P0. Permanecem fora deste escopo:

1. Atualizar ou retirar os testes/rotas legados OpenAI (`mockedLLMRouter` e expectativa `BOOK_APPOINTMENT`) em trabalho separado de compatibilidade.
2. Corrigir a dívida global de lint antes de usar lint global como gate de release.
3. Executar preparação operacional de piloto e aceite humano como fase posterior separada.

## 11. Nível de confiança QA

**HIGH.** O núcleo determinístico, a persistência real, o constraint GIST, cancelamento/reagendamento, isolamento de cliente/tenant, RLS autenticado e o caminho completo de conversa foram comprovados no Supabase QA isolado.

## 12. Status do piloto

**CORE VALIDATED / PILOT PREPARATION NEXT.** Esta evidência valida o WAI Core; não substitui preparação operacional nem aceite humano de um piloto controlado.

## REAL SUPABASE QA VALIDATION

Branch de validação: `codex-p0-real-supabase`

LOCAL CORE:
30/30

REAL SUPABASE:
11/11

CUSTOMER CREATE + READ:
PASS

BOOKING + READ:
PASS

DOUBLE BOOKING / REAL GIST:
PASS — PostgreSQL `23P01` do constraint `prevent_appointment_overlap`, traduzido pelo WAI para `SLOT_OCCUPIED`.

CANCELLATION:
PASS

CANCELLED SLOT RELEASE:
PASS

RESCHEDULING:
PASS

OLD SLOT RELEASE:
PASS

CUSTOMER OWNERSHIP:
PASS — tentativa de terceiro bloqueada antes de tool/mutação e status original confirmado por read-back.

APPLICATION TENANT ISOLATION:
PASS — acesso sem membership e referência de cliente de outro tenant foram rejeitados pelo WAI Core.

RLS POLICY VALIDATION:
PASS — sessões `authenticated` temporárias de tenants distintos observaram somente suas próprias linhas; tentativa cross-tenant de update retornou zero linhas e não alterou o registro.

FULL CONVERSATION → REAL DB:
PASS — `processConversationTurn` executou roteador local, tool, calendar service, escrita do agendamento, read-back, persistência das mensagens de cliente/assistente e resposta final.

GEMINI FALLBACK:
1/1

QA TRUST LEVEL:
HIGH

CORE STATUS:
CORE VALIDATED / PILOT PREPARATION NEXT
