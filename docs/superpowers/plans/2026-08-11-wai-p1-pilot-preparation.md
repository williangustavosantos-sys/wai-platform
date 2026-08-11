# WAI P1 — Plano de implementação da preparação do piloto

Data: 11 de agosto de 2026
Branch: `codex-p1-pilot-preparation`
Especificação: `docs/superpowers/specs/2026-08-11-wai-p1-pilot-preparation-design.md`
Base P0: 30/30 local e 11/11 Supabase QA real

## 1. Estratégia

Implementar o P1 por extensões incrementais das camadas existentes. Cada etapa deve terminar com testes proporcionais ao risco antes da próxima. Nenhuma regra de negócio será transferida para componentes React, e nenhuma mutation será considerada concluída sem confirmação do serviço e, nos testes críticos, leitura posterior do Supabase.

O plano não inclui migrations. Se um bloqueio real de schema aparecer, a implementação para, documenta a evidência e solicita autorização antes de criar qualquer migration.

## 2. Rotas, componentes e serviços reutilizados

### Rotas

- `src/app/page.tsx`: resolução da organização inicial.
- `src/app/app/[slug]/layout.tsx`: shell autenticado e contexto organizacional.
- `src/app/app/[slug]/page.tsx`: Settings secundário.
- `src/app/app/[slug]/assistant/page.tsx`: configuração do Digital Employee.
- `src/app/app/[slug]/assistant/chat/page.tsx`: área principal Digital Employee.
- `src/app/app/[slug]/calendar/page.tsx`: área principal Calendar.
- Rotas CRM e Rules permanecem existentes, sem duplicação.

### Componentes

- `TenantNavTabs.tsx`: será simplificado para as duas áreas principais e Settings secundário.
- `SettingsForm.tsx`: será ampliado para a configuração empresarial mínima.
- `AssistantForm.tsx`: continuará responsável somente pelo Digital Employee.
- `ChatSimulatorView.tsx`: será reaproveitado como interface operacional, com copy e props dinâmicas; não será criado um segundo chat.
- `CalendarView.tsx`: continuará como container das operações da agenda e gestão de serviços/profissionais.

### Serviços e Core

- `security/auth.ts`: resolução de sessão, organização e função.
- `organization.service.ts`: leitura e atualização da configuração empresarial.
- `assistant.service.ts`: configuração do Digital Employee.
- `calendar.service.ts`: serviços, profissionais e compromissos.
- `rules.service.ts`: exceções e bloqueios.
- `conversation.service.ts`: caminho conversacional real.
- `local_intent_router.ts`, `tools.service.ts` e `deterministic_response_generator.ts`: comandos operacionais existentes.
- `db/server.ts`: clientes autenticado e administrativo existentes.

## 3. Arquivos esperados para alteração

### Shell, autenticação e navegação

- `src/app/page.tsx`
- `src/app/login/page.tsx`
- `src/app/app/[slug]/layout.tsx`
- `src/app/app/[slug]/TenantNavTabs.tsx`
- `src/security/auth.ts`, somente se necessário para expor um contexto tipado já verificado
- `src/app/globals.css`
- `src/locales/pt-BR.json`
- `src/locales/it-IT.json`

### Configuração empresarial e Digital Employee

- `src/modules/organizations/organization.service.ts`
- `src/app/app/[slug]/page.tsx`
- `src/app/app/[slug]/SettingsForm.tsx`
- `src/app/app/[slug]/actions.ts`
- `src/modules/assistant/assistant.service.ts`
- `src/app/app/[slug]/assistant/page.tsx`
- `src/app/app/[slug]/assistant/AssistantForm.tsx`
- `src/modules/ai/gemini_ai_provider.ts`
- `src/modules/ai/simple_ai_provider.ts`, apenas para remover fallbacks empresariais/personas fixos usados pelo caminho do piloto

### Conversa e autorização operacional

- `src/modules/conversation/conversation.types.ts`
- `src/modules/conversation/conversation.service.ts`
- `src/modules/conversation/webchat_adapter.ts`, somente se o contrato tipado precisar transportar contexto não privilegiado do canal
- `src/app/app/[slug]/assistant/chat/actions.ts`
- `src/app/app/[slug]/assistant/chat/page.tsx`
- `src/app/app/[slug]/assistant/chat/ChatSimulatorView.tsx`
- `src/modules/ai/local_intent_router.ts`
- `src/modules/ai/deterministic_response_generator.ts`
- `src/modules/tools/tools.service.ts`

### Agenda, serviços, profissionais e bloqueios

- `src/modules/calendar/calendar.types.ts`
- `src/modules/calendar/calendar.service.ts`
- `src/app/app/[slug]/calendar/page.tsx`
- `src/app/app/[slug]/calendar/actions.ts`
- `src/app/app/[slug]/calendar/CalendarView.tsx`
- `src/modules/rules/rules.service.ts`
- `src/modules/rules/rules.types.ts`, somente se o contrato de intervalo precisar ser explicitado

### Relatório

- `WAI_P1_PILOT_READINESS_REPORT.md`

## 4. Novos arquivos previstos

- `src/modules/shared/organization-timezone.ts`: conversões e intervalos usando IANA timezone da organização.
- `src/app/app/[slug]/calendar/calendar-view-model.ts`: geração pura da grade mensal e projeções visíveis, sem mutation.
- `src/app/app/[slug]/calendar/MonthlyCalendar.tsx`: grade mensal focada em leitura.
- `src/app/app/[slug]/calendar/AppointmentDetailsDialog.tsx`: detalhes e formulário das ações delegadas.
- `src/app/app/[slug]/loading.tsx`: loading comum do workspace autenticado.
- `src/app/app/[slug]/error.tsx`: erro recuperável sem vazamento de detalhes.
- `tests/unit/organization_timezone.test.ts`: mês, DST, renderização e conversões explícitas.
- `tests/p1/calendar_visible_state.test.tsx`: comportamento visível mensal, vazios, status e permissões.
- `tests/p1/real_pilot_qa.test.ts`: jornada autenticada e persistência real isolada.
- `WAI_P1_PILOT_READINESS_REPORT.md`: evidência, checklist humano e status.

Não serão criados novos frameworks, clientes Supabase, stores ou camadas de serviço paralelas.

## 5. Ordem incremental de implementação

### Etapa 0 — Verificação de contratos atuais

Objetivo: impedir implementação baseada em APIs desatualizadas.

1. Ler integralmente os guias locais relevantes do Next.js 16:
   - App Router `page` e `searchParams`;
   - Server Actions/forms;
   - `loading.tsx` e tratamento de erros;
   - Server e Client Components.
2. Consultar changelog e documentação oficial atual do Supabase para SSR/Auth/RLS usados pelo projeto.
3. Confirmar novamente que `.env.test` está ignorado e que não há segredo staged.

Dependência: nenhuma.
Checkpoint: `git status -sb` sem alterações inesperadas.

### Etapa 1 — Timezone organizacional compartilhado

Objetivo: estabelecer a referência temporal única antes de alterar agenda ou conversa.

1. Criar `organization-timezone.ts` com funções puras para:
   - validar IANA timezone;
   - obter o mês atual da organização;
   - calcular início inclusivo e fim exclusivo do mês em UTC;
   - converter `datetime-local` da organização para UTC;
   - formatar instantes no timezone organizacional;
   - calcular intervalo diário organizacional para consultas do proprietário.
2. Cobrir mudança de horário legal e limites de mês em testes unitários.
3. Não usar timezone do navegador para regras de negócio.

Dependência: Etapa 0.
Checkpoint: `npx vitest run tests/unit/organization_timezone.test.ts` e `npx tsc --noEmit`.

### Etapa 2 — Identidade empresarial canônica

Objetivo: tornar `organizations.name` a única fonte ativa de escrita.

1. Ampliar o input de `updateOrganizationSettings()` com `businessName` e campos compatíveis.
2. Validar nome não vazio, email opcional e strings normalizadas.
3. Atualizar `organizations.name` no mesmo update autenticado que mescla `address`, `phone`, `email` e `working_hours` em `settings_json`.
4. Preservar `settings_json.displayName` sem reescrita.
5. Registrar nome anterior/novo e settings anterior/novo no Audit Log.
6. Atualizar `SettingsForm`, ação e página para usar o nome canônico.
7. Usar `displayName` somente como fallback legado de leitura.

Dependência: Etapa 0.
Checkpoint: testes de isolamento organizacional existentes, TypeScript e `git diff --check`.

### Etapa 3 — Contexto administrativo real na conversa

Objetivo: remover integralmente reconhecimento produtivo por IDs, telefones e fixtures.

1. Definir um contexto tipado e server-only indicando que a chamada veio do workspace organizacional autenticado.
2. Em `sendChatMessageAction`, validar sessão e organização antes de chamar o Core.
3. Em `processConversationTurn()`, reconfirmar a organização e obter `organization_members.role`.
4. Derivar permissões de leitura/mutation do papel verificado.
5. Manter fluxos de cliente sem contexto organizacional como não administrativos.
6. Remover o ID prefixado, telefone QA e qualquer fixture do reconhecimento owner/staff.
7. Substituir timezone fixo do contexto conversacional por `access.timezone`.
8. Ajustar consultas de agenda, estatísticas e datas relativas para intervalos organizacionais.
9. Preservar a assinatura existente com opção adicional retrocompatível, evitando quebrar adaptadores externos.

Dependências: Etapa 1.
Checkpoint: P0 local 30/30, testes unitários de autorização e teste específico da pergunta do proprietário.

### Etapa 4 — Identidade dinâmica do Digital Employee

Objetivo: separar empresa e Digital Employee em toda a experiência do piloto.

1. Carregar organização e Digital Employee no Server Component do chat.
2. Passar `businessName`, `digitalEmployeeName`, idioma, tom e avatar existente como props.
3. Remover inferências por slug em `ChatSimulatorView`.
4. Remover “Chiara”, “Studio Aurora” e “Studio Brera” dos fallbacks produtivos do assistant/Gemini/simple provider usados no piloto.
5. Trocar o default ausente por identidade genérica configurável.
6. Remover copy de simulador/QA da experiência principal e manter detalhes técnicos recolhidos, se ainda úteis.
7. Manter `/assistant` como configuração secundária, sem confundir os dois nomes.

Dependências: Etapas 2 e 3.
Checkpoint: teste de separação de identidades, fluxo conversacional direcionado, TypeScript.

### Etapa 5 — Serviços e profissionais editáveis

Objetivo: completar a configuração operacional mínima sem mudar schema.

1. Corrigir o tipo de status de serviço para o contrato real `active|inactive`.
2. Permitir que `listServices()` e `listProfessionals()` recebam opção administrativa para incluir inativos.
3. Criar `updateService()` com nome, descrição, duração, preço e status.
4. Criar `updateProfessional()` com nome, cargo, email, telefone e status.
5. Validar dados no serviço e restringir updates por `organization_id` e papel.
6. Registrar before/after no Audit Log.
7. Adicionar Server Actions finas e formulários de edição ao container existente.
8. Manter seletores de booking somente com registros ativos.

Dependências: Etapa 2 para padrões de formulário/auditoria.
Checkpoint: testes unitários de serviço, persistência QA de desativação/reativação e P0 local 30/30.

### Etapa 6 — Backend mensal e ações da agenda

Objetivo: preparar dados reais para a UI mensal e todas as mutations aprovadas.

1. Ampliar `listAppointments()` com intervalo UTC opcional e filtros organizacionais.
2. Adicionar guardas de estado a cancelamento e reagendamento.
3. Adicionar Server Action de reagendamento que delega a `rescheduleAppointment()`.
4. Adicionar Server Action de bloqueio que delega a `createBusinessException()`.
5. Adaptar exceções para conversão pelo timezone organizacional, sem UTC meia-noite implícita.
6. Consultar `listBusinessExceptions()` junto aos compromissos do mês.
7. Propagar códigos estruturados como `SLOT_OCCUPIED` para a apresentação.
8. Garantir que queries e mutations continuam sob RLS/autorização dos serviços.

Dependências: Etapas 1 e 5.
Checkpoint: testes unitários de agenda/regras, P0 local 30/30 e casos QA reais de booking, cancelamento, reagendamento e bloqueio.

### Etapa 7 — Shell operacional e estados comuns

Objetivo: centrar o produto nas duas áreas aprovadas.

1. Direcionar usuário organizacional autenticado para Digital Employee.
2. Simplificar `TenantNavTabs` para Digital Employee, Calendar e Settings secundário.
3. Preservar rotas CRM/Rules sem destaque nem remoção.
4. Remover credenciais QA e nomes de fixtures da tela de login e das traduções produtivas.
5. Tornar navbar e navegação móveis.
6. Adicionar loading e error boundaries do workspace.
7. Diferenciar acesso negado, falha de dados e estado vazio.

Dependências: Etapas 2 e 4.
Checkpoint: renderização dirigida, TypeScript e build parcial/completo conforme custo.

### Etapa 8 — Calendário mensal e detalhes

Objetivo: entregar leitura imediata da agenda e ações persistentes.

1. Validar `searchParams.month` no Server Component.
2. Calcular o intervalo pelo timezone da organização.
3. Criar view model puro para grade mensal, compromissos e exceções.
4. Renderizar mês anterior/atual/próximo com links determinísticos.
5. Mostrar cliente, serviço, profissional, hora e status.
6. Exibir detalhes ao selecionar compromisso.
7. Conectar cancelamento e reagendamento às Server Actions.
8. Conectar bloqueio de dia/período ao serviço de exceções.
9. Revalidar a rota após sucesso e exibir erro estruturado após falha.
10. Manter gestão de serviços/profissionais como abas secundárias existentes.
11. Adaptar grade, formulários e diálogo para mobile.

Dependências: Etapas 5, 6 e 7.
Checkpoint: testes de estado visível, TypeScript, build e `git diff --check`.

### Etapa 9 — Aceitação P1 real no Supabase QA

Objetivo: provar comportamento e persistência sem mocks.

1. Criar run único e organização/usuário QA temporários quando necessário.
2. Usar service role somente para setup/cleanup e cliente autenticado para operações sob RLS.
3. Verificar por leitura posterior:
   - nome empresarial canônico e fallback intocado;
   - identidade separada do Digital Employee;
   - serviço desativado/reativado;
   - profissional desativado/reativado;
   - booking visível no modelo mensal;
   - cancelamento persistido e visível;
   - reagendamento persistido e visível;
   - exceção persistida e aplicada à disponibilidade;
   - pergunta do proprietário pelo caminho completo da conversa;
   - isolamento de organização.
4. Limpar somente registros identificados pelo run.
5. Nunca truncar tabelas nem usar produção.

Dependências: Etapas 2–8.
Checkpoint: teste P1 real isolado integralmente verde e P0 Supabase ainda 11/11.

### Etapa 10 — Relatório e regressão final

Objetivo: consolidar evidências e salvar apenas trabalho seguro.

1. Criar `WAI_P1_PILOT_READINESS_REPORT.md` em português com as 11 seções requeridas.
2. Registrar testes automatizados e checklist humano A–J ainda pendente.
3. Documentar dívida legada não bloqueante sem expandir escopo.
4. Executar regressão final na ordem:
   - `OFFLINE_AI_TEST=true GOOGLE_GENERATIVE_AI_API_KEY='' npx vitest run tests/chiara/real_conversation_scenarios.test.ts --reporter=dot --silent`;
   - `npm run test:supabase:qa`;
   - testes P1 unitários e reais;
   - Gemini fallback se os arquivos do provider forem alterados;
   - `npx tsc --noEmit`;
   - `npm run build`;
   - `git diff --check`.
5. Inspecionar staged files e confirmar ausência de `.env*`, segredos, logs e scripts diagnósticos.
6. Commitar o produto/testes/relatório com `feat: prepare WAI for controlled pilot`.
7. Fazer push para `origin/codex-p1-pilot-preparation` sem merge em `main`.

Dependências: todas as etapas anteriores.
Checkpoint final: somente `READY FOR HUMAN ACCEPTANCE TEST`; o piloto controlado permanece dependente da execução humana A–J.

## 6. Matriz de dependências

| Etapa | Depende de | Libera |
|---|---|---|
| 0. Contratos | — | todas |
| 1. Timezone | 0 | conversa, agenda, exceções |
| 2. Nome/configuração | 0 | Settings, shell, identidade |
| 3. Autorização conversacional | 1 | owner query e Digital Employee |
| 4. Identidade dinâmica | 2, 3 | Digital Employee operacional |
| 5. Serviços/profissionais | 2 | gestão e seletores ativos |
| 6. Backend mensal | 1, 5 | calendário mensal e mutations |
| 7. Shell/estados | 2, 4 | experiência operacional |
| 8. UI Calendar | 5, 6, 7 | aceitação visível |
| 9. QA real P1 | 2–8 | evidência persistida |
| 10. Relatório/regressão | 9 | commit e push |

## 7. Checkpoints de regressão

- Base intacta já confirmada: local 30/30 e real 11/11.
- Após autorização conversacional: local 30/30.
- Após serviços/profissionais: unitários afetados + local 30/30.
- Após backend Calendar: testes de calendário/regras + local 30/30.
- Após UI: TypeScript + build + testes de estado visível.
- Após QA real P1: P1 real + P0 real 11/11.
- Antes do commit: suíte final completa, `git diff --check`, staged-file audit e secret hygiene.

Uma regressão P0 interrompe a etapa seguinte. O problema será corrigido dentro do escopo da mudança que o causou ou reportado como bloqueio; não será mascarado por mocks ou overrides.

## 8. Critério de parada

O trabalho para ao concluir P1, relatório, commit e push. Não inicia P2, integrações, WhatsApp, workflows, analytics, pagamentos ou novos agentes.

