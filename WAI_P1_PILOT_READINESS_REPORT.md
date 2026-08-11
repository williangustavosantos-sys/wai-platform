# WAI P1 — Relatório de prontidão do piloto

Data: 11 de agosto de 2026
Branch: `codex-p1-pilot-preparation`
Base P0 preservada: 30/30 local e 11/11 Supabase QA real

## Escopo entregue

- Navegação principal: Digital Employee e Calendar; Settings permanece secundário.
- `organizations.name` é o nome empresarial canônico. `settings_json.displayName` é apenas fallback legado de leitura e não é regravado.
- A identidade do Digital Employee permanece em `digital_employees.name`, separada da empresa.
- O papel administrativo da conversa vem de sessão autenticada, organização verificada e `organization_members.role`; nenhum telefone, ID ou fixture QA concede privilégio.
- `organizations.timezone` determina intervalo mensal, renderização, conversão de reagendamento, bloqueios e datas relativas.
- Serviços e profissionais podem ser editados e alternados entre ativo/inativo pelo serviço existente, com auditoria.
- O Calendar usa dados reais, intervalo mensal no servidor, detalhes, cancelamento, reagendamento e bloqueio via Server Actions finas que delegam para os serviços existentes.

Não houve migration, framework novo, cliente Supabase paralelo nem lógica operacional duplicada no frontend.

## Evidência automatizada

| Verificação | Resultado |
| --- | --- |
| P0 local — cenários realistas offline | 30/30 PASS |
| P0 Supabase QA real | 11/11 PASS |
| P1 visível/unitário | 12/12 PASS |
| P1 Supabase QA real isolado | 10/10 PASS |
| TypeScript | PASS |
| Build Next.js | PASS |
| `git diff --check` | PASS |

### P1 Supabase QA real — 10/10

1. Nome empresarial canônico persistido e fallback legado preservado.
2. Identidade separada do Digital Employee persistida.
3. Serviço criado, desativado, reativado e relido.
4. Profissional criado, desativado, reativado e relido.
5. Booking por `processConversationTurn()` relido no banco e visível no modelo mensal.
6. Consulta de agenda por proprietário autenticado, sem reconhecimento por telefone ou fixture.
7. Reagendamento persistido e refletido no mês.
8. Cancelamento persistido e refletido como cancelado.
9. Bloqueio empresarial persistido e aplicado à disponibilidade real.
10. Leitura e mutation entre organizações bloqueadas pela fronteira de aplicação/RLS.

Cada execução P1 usa organização, usuário e dados exclusivos por prefixo. A limpeza posterior confirmou zero organizações temporárias e zero auditorias estáticas remanescentes.

## Autorização e isolamento

- Operações normais usam cliente autenticado e RLS.
- O service role permaneceu limitado a setup/cleanup QA e registro de auditoria server-only já existente.
- A validação RLS de menor privilégio do P0 permaneceu verde no QA real.
- A consulta de agenda administrativa é liberada somente ao contexto server-only do workspace autenticado com papel `organization_owner` ou `organization_operator`.

## Estados do piloto

- Loading da área autenticada e erro recuperável da rota.
- Estados vazios para agenda e catálogos sem registros.
- Validação de nome, email, duração, preço, datas e transições de estado no backend.
- Conflitos reais GIST retornam `SLOT_OCCUPIED`.
- Viewer pode ler; owner/operator podem executar as mutations permitidas pelos serviços.

## Dívida legada não bloqueante

- `SimpleAIProvider` permanece somente como caminho legado coberto por testes unitários; o caminho operacional do piloto usa `LocalIntentRouter` e `processConversationTurn()`.
- Gemini continua opcional e não é requisito para os fluxos determinísticos do P1.
- As rotas CRM e Rules permanecem disponíveis por compatibilidade, mas fora da navegação principal do piloto.

## Checklist humano A–J

- A. Login do proprietário e organização correta — PENDENTE
- B. Edição empresarial, reload e persistência — PENDENTE
- C. Criação/edição de serviço disponível ao Core — PENDENTE
- D. Configuração de profissional refletida na agenda — PENDENTE
- E. Nome configurado do Digital Employee e conversa real — PENDENTE
- F. Booking conversacional aparece no Calendar — PENDENTE
- G. Reagendamento aparece no novo horário — PENDENTE
- H. Cancelamento atualiza o Calendar — PENDENTE
- I. Pergunta de agenda do proprietário usa dados reais — PENDENTE
- J. Organização A não visualiza dados da organização B — PENDENTE

## Status P1

`READY FOR HUMAN ACCEPTANCE TEST`

O status máximo permanece este até a execução humana do checklist A–J. Não declarar `READY FOR CONTROLLED PILOT` nesta etapa.
