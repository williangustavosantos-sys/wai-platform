# WAI P1 — Especificação funcional de preparação do piloto

Data: 11 de agosto de 2026  
Base validada: `codex-p0-real-supabase` em `ab0f764`  
Abordagem aprovada: reaproveitamento incremental da arquitetura existente

## 1. Objetivo

Transformar o WAI Core validado em uma interface operacional mínima para uma empresa real configurar seu negócio, conversar com seu Digital Employee e compreender sua agenda mensal.

O P1 não cria uma nova arquitetura. Ele reaproveita autenticação, contexto organizacional, RLS, rotas, serviços, componentes e Supabase existentes. A automação e os serviços determinísticos continuam controlando as operações; a IA permanece responsável pela compreensão e conversa.

O estado máximo após implementação e testes automatizados é `READY FOR HUMAN ACCEPTANCE TEST`. A classificação `READY FOR CONTROLLED PILOT` depende da execução humana dos cenários A–J.

## 2. Terminologia e separação de identidades

- WAI é o produto.
- Chiara é apenas uma persona fictícia presente em fixtures e nomes legados de QA.
- O nome empresarial e o nome do Digital Employee são conceitos independentes.
- `organizations.name` é o nome canônico da empresa.
- `digital_employees.name` é o nome configurado do Digital Employee.
- Nenhuma tela ou fluxo de produção pode inferir esses nomes a partir de slug, IDs, telefones ou fixtures.

## 3. Escopo P1

### Incluído

- Entrada autenticada na interface operacional da organização.
- Navegação principal centrada em Digital Employee e Calendar.
- Settings como área secundária.
- Chat real pelo caminho `processConversationTurn()`.
- Permissões administrativas derivadas de sessão, organização verificada e função em `organization_members`.
- Calendário mensal com dados reais, detalhes, cancelamento, reagendamento e bloqueios.
- Configuração empresarial mínima.
- Edição e ativação/desativação de serviços e profissionais.
- Estados de carregamento, vazio, validação, erro e autorização.
- Testes P1 com comportamento observável e confirmação do estado persistido no Supabase.
- Checklist humano A–J e relatório de prontidão P1.

### Excluído

- P2 e fases posteriores.
- WhatsApp, voz, pagamentos, relatórios, lembretes, analytics e nova UI pública.
- Genkit, Mastra, MCP, Langfuse, Inngest, pgvector, Qdrant, Graphiti, A2UI e multiagentes.
- Nova arquitetura de agentes, RAG, busca vetorial ou fonte paralela de dados.
- Migração ampla de dados ou refatoração global de dívida legada.
- Drag-and-drop, recorrência e agenda empresarial avançada.

## 4. Arquitetura reutilizada

### Rotas

- `/`: autentica, resolve a organização principal e direciona o usuário para a área operacional.
- `/app/[slug]/assistant/chat`: área principal Digital Employee.
- `/app/[slug]/calendar`: área principal Calendar.
- `/app/[slug]`: área secundária Settings e resumo da empresa.
- `/app/[slug]/assistant`: configuração secundária do Digital Employee.
- Rotas CRM e Rules existentes permanecem disponíveis por compatibilidade, sem destaque na navegação principal.

### Camadas

1. Server Components resolvem sessão e organização.
2. Client Components apresentam dados e coletam ações.
3. Server Actions revalidam sessão e delegam para serviços.
4. Serviços verificam a organização e a função antes de ler ou mutar.
5. O cliente Supabase autenticado aplica RLS.
6. O cliente administrativo continua restrito ao servidor e aos registros de auditoria.

Não haverá regra operacional duplicada no frontend.

## 5. Fontes canônicas de dados

### Nome empresarial

Leituras novas usam `organizations.name`. `settings_json.displayName` é consultado apenas como fallback temporário quando o nome canônico não puder ser resolvido. Novas escritas atualizam somente `organizations.name`.

O campo legado não será apagado nem atualizado em paralelo. Dessa forma, ele permanece compatível sem atuar como segunda fonte de verdade.

### Configuração empresarial

Para o P1, os seguintes campos continuam no `organizations.settings_json`, conforme o contrato atual do Core:

- `address`
- `phone`
- `email`
- `working_hours`

Não será criada estrutura concorrente.

### Digital Employee

Identidade, idioma, tom e personalidade permanecem em `digital_employees`. O fallback de criação inicial será genérico e nunca usará uma persona QA fixa.

## 6. Autenticação e autorização

Toda capacidade de proprietário ou equipe administrativa seguirá:

`sessão autenticada → organização verificada → organization_members.role`

Regras:

- `organization_owner`: configura a empresa e executa operações administrativas.
- `organization_operator`: executa operações permitidas pelos serviços existentes.
- `organization_viewer`: leitura, sem mutations.
- Um usuário sem associação ativa recebe negação explícita, não um estado vazio.
- Slugs recebidos pela rota nunca substituem a verificação de associação.
- O contexto administrativo do chat será construído no servidor e reconfirmado no Core.
- Fluxos de cliente não recebem privilégios administrativos por telefone, ID, nome ou conteúdo de mensagem.
- Reconhecimento baseado nos telefones QA, IDs fixos e fixtures será removido da produção.

## 7. Referência única de timezone

`organizations.timezone` é a única referência para:

- intervalo do mês consultado;
- mês corrente de fallback;
- exibição dos compromissos;
- valores de reagendamento;
- criação e exibição de exceções empresariais.

O navegador pode renderizar controles, mas seu timezone local não participa da lógica empresarial. Conversões entre data/hora local da organização e UTC serão realizadas em código compartilhado no servidor ou domínio.

## 8. Fluxo Digital Employee

1. A página verifica a sessão e o acesso à organização.
2. Carrega `organizations.name` e a configuração do Digital Employee separadamente.
3. Renderiza ambos sem inferência pelo slug.
4. O usuário envia uma mensagem.
5. A Server Action cria um contexto organizacional confiável e chama `processConversationTurn()`.
6. O Core reconfirma a associação e determina permissões pelo papel.
7. Router, ferramentas e serviços existentes executam a operação.
8. A resposta só confirma sucesso após o backend confirmar a operação.
9. Histórico e telemetria continuam persistidos pelo caminho existente.

Perguntas do proprietário, como “Who do I have tomorrow?”, usam `ownerListAgenda` e dados reais da organização. Bloqueios e reagendamentos usam as ferramentas e os serviços validados.

## 9. Fluxo Calendar

### Consulta mensal

- O parâmetro de mês usa o formato `YYYY-MM`.
- Ausência ou valor inválido usa o mês atual da organização.
- O servidor calcula início inclusivo e fim exclusivo no timezone organizacional.
- `calendar.service.ts` consulta somente o intervalo necessário.
- A grade mensal mostra todos os dias e compromissos relevantes.

### Detalhes

O detalhe de compromisso contém:

- cliente;
- serviço;
- profissional;
- início e fim no timezone organizacional;
- status;
- observações e motivo de cancelamento, quando aplicável.

### Ações

- Cancelar chama `updateAppointmentStatus()`.
- Reagendar chama `rescheduleAppointment()`.
- Conflitos reais de GIST retornam `SLOT_OCCUPIED`.
- Bloquear dia ou período chama `createBusinessException()`.
- Fechamentos são lidos por `listBusinessExceptions()` e aparecem no calendário.
- Estados incompatíveis são rejeitados pelo serviço, não apenas escondidos pela UI.

Não haverá cálculo independente de disponibilidade ou sobreposição no navegador.

## 10. Fluxo Company Settings

1. A tela carrega `organizations.name` como nome empresarial.
2. Se necessário, usa `settings_json.displayName` somente para leitura legada.
3. O formulário permite editar nome, endereço, telefone, email e horário normal.
4. A Server Action valida os dados e chama o serviço organizacional.
5. O serviço atualiza `organizations.name` e mescla apenas os campos compatíveis no `settings_json`.
6. O cliente autenticado aplica a política RLS de atualização da organização.
7. O Audit Log registra antes e depois.
8. O reload comprova persistência.

## 11. Serviços e profissionais

### Serviços

Permite criar e editar nome, descrição, duração, preço e status `active|inactive`. Listas administrativas incluem inativos; seletores operacionais incluem somente ativos.

### Profissionais

Permite criar e editar nome, cargo, email, telefone e status `active|inactive`. Listas administrativas incluem inativos; calendário e conversa usam somente ativos nas escolhas operacionais.

Todas as mutations passam por `calendar.service.ts`, verificam organização e papel e registram auditoria.

## 12. Estados de interface

### Loading

- Estado de rota enquanto sessão, organização e dados iniciais são resolvidos.
- Botões indicam processamento e bloqueiam envio duplicado.
- O chat mantém indicador enquanto o Core processa.
- A troca de mês não apresenta dados antigos como se fossem atuais.

### Empty

- Agenda: “Nenhum compromisso neste período.”
- Serviços: “Adicione um serviço antes de aceitar agendamentos.”
- Profissionais: “Adicione um profissional para começar a usar a agenda.”
- Digital Employee ausente: configuração inicial genérica e editável.
- Exceções ausentes: calendário continua normalmente.

### Validation

- Nomes não podem ficar vazios após `trim`.
- Emails devem ser válidos quando informados.
- Duração deve ser inteira e positiva.
- Preço deve ser não negativo.
- Datas devem ser válidas no timezone da organização.
- Mês inválido retorna ao mês corrente organizacional.
- Reagendamento conflitante apresenta `SLOT_OCCUPIED`.
- Estados incompatíveis são recusados no backend.

### Error

- Sessão inválida redireciona para login.
- Acesso negado é explícito.
- Erros de Supabase não expõem credenciais nem detalhes sensíveis.
- Falhas de conversa preservam a possibilidade de nova tentativa.
- Sucesso visual ocorre somente após confirmação do serviço.

## 13. Responsividade

- Navegação principal acessível em desktop e navegador móvel.
- Grade mensal possui apresentação móvel legível, sem exigir interação precisa de desktop.
- Formulários passam de múltiplas colunas para uma coluna em telas estreitas.
- Modais e detalhes respeitam a largura da viewport e permitem rolagem.

## 14. Testes de aceitação automatizados

Os testes P1 são separados da regressão P0 e usam o Supabase QA isolado com dados identificáveis e limpeza restrita ao run.

Casos críticos verificam simultaneamente comportamento observável e estado persistido:

1. Atualizar `organizations.name`, recarregar e confirmar o valor no banco.
2. Confirmar que `settings_json.displayName` não é reescrito.
3. Confirmar separação entre nome empresarial e nome do Digital Employee.
4. Criar, editar, desativar e reativar serviço; confirmar UI/domínio e persistência.
5. Criar, editar, desativar e reativar profissional; confirmar UI/domínio e persistência.
6. Perguntar a agenda pelo caminho completo `processConversationTurn()` com contexto organizacional autenticado e confirmar a resposta contra o banco.
7. Criar booking pela conversa e confirmar sua presença na consulta mensal.
8. Reagendar pelo serviço e confirmar novo horário persistido e refletido na consulta mensal.
9. Cancelar e confirmar status persistido e refletido na consulta mensal.
10. Criar bloqueio por `createBusinessException()`, confirmar persistência e efeito na disponibilidade do Core.
11. Provar que organização A não lê nem altera os registros de B.

O teste não usa arrays falsos como prova de persistência, não trunca tabelas compartilhadas e não toca produção.

## 15. Checklist humano A–J

- A: login do proprietário e organização correta.
- B: edição empresarial, reload e persistência.
- C: criação/edição de serviço disponível ao Core.
- D: configuração de profissional refletida na agenda.
- E: Digital Employee com nome configurado e resposta real do Core.
- F: booking conversacional aparece no calendário.
- G: reagendamento aparece no novo horário.
- H: cancelamento atualiza o calendário.
- I: pergunta “Who do I have tomorrow?” responde com dados reais.
- J: empresa A não visualiza dados da empresa B.

## 16. Critérios de conclusão

- P0 local permanece 30/30.
- P0 Supabase real permanece 11/11.
- Testes P1 relevantes passam.
- TypeScript, build e `git diff --check` passam.
- Nenhum segredo, `.env`, log ou script diagnóstico entra no commit.
- O relatório `WAI_P1_PILOT_READINESS_REPORT.md` documenta evidências e dívida legada não bloqueante.
- O status máximo antes do checklist humano é `READY FOR HUMAN ACCEPTANCE TEST`.

