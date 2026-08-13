# WAI — Relatório final de prontidão para validação humana do P1

Data: 13 de agosto de 2026

Branch: `codex-p1-pilot-preparation`

Commit técnico auditado: `9807acf51e54c56750fc17e39644a1f1e604ba1f`

Produção alterada: **não**

Migrations alteradas: **não**

Merge em `main`: **não**

## Estado atual do sistema

O núcleo P0/P1 está automatizadamente verde e a correção conversacional está integrada aos módulos operacionais existentes. O estado recomendado é:

`READY FOR HUMAN ACCEPTANCE TEST`

Isso não significa aceitação final do P1. O fundador ainda precisa executar o checklist A–J deste relatório.

O fluxo auditado é:

`login autenticado → organização resolvida por membership/RLS → Digital Employee configurado → conversa persistida → roteamento de intenção → ferramenta operacional → serviço/agenda → Supabase → resposta persistida`

## Resultado dos testes

| Gate | PASS | FAIL | SKIP | Resultado |
| --- | ---: | ---: | ---: | --- |
| P0 local (`real_conversation_scenarios`) | 30 | 0 | 0 | PASS |
| P0 Supabase QA real | 11 | 0 | 0 | PASS |
| Unit + integration + P1 local | 61 | 0 | 10 | PASS; 10 casos reais executados separadamente |
| P1 Supabase QA real | 10 | 0 | 0 | PASS |
| Harness Chiara legado | 100 | 0 | 0 | PASS |
| Regressão local completa | 291 | 0 | 22 | PASS |
| TypeScript (`npx tsc --noEmit`) | 1 | 0 | 0 | PASS |
| Build Next.js (`npm run build`) | 1 | 0 | 0 | PASS |
| Lint focado nos arquivos auditados sem dívida legada | 1 | 0 | 0 | PASS |

Totais da regressão local completa: **313 testes = 291 PASS + 22 SKIP + 0 FAIL**.

Os 22 skips são gates controlados: 11 casos P0 Supabase real, 10 casos P1 Supabase real e 1 validação externa do provedor Gemini. Os dois conjuntos Supabase foram executados separadamente e passaram 11/11 e 10/10. A validação externa do Gemini permaneceu opt-in e não é autoridade para persistência ou agenda.

## Evidências técnicas

- O P0 real criou e releu cliente e booking, confirmou bloqueio GIST de sobreposição, cancelamento, liberação de slot, reagendamento, ownership, isolamento de aplicação, RLS autenticado e conversa persistida.
- O P1 real confirmou nome canônico da empresa, identidade separada do Digital Employee, serviços, profissionais, booking conversacional visível no mês, perguntas do proprietário, reagendamento, cancelamento, bloqueio de agenda e bloqueio cross-organization.
- O booking conversacional só confirma após `APPOINTMENT_CREATED` e um ID persistido.
- O fluxo executa `checkAvailability` antes de `createAppointment`.
- A regressão multilíngue cobre italiano, inglês, português, troca de idioma, continuidade entre turnos, coleta de informações ausentes e ausência de confirmação falsa.
- A tela de login foi renderizada e inspecionada em desktop e viewport móvel: sem erro de console e sem overflow horizontal. As telas autenticadas permanecem parte da validação humana.
- A revisão de Supabase foi confrontada com a documentação atual de RLS e o changelog de breaking changes: <https://supabase.com/docs/guides/database/postgres/row-level-security> e <https://supabase.com/changelog?types=breaking-change>.

## Auditoria por área

### Idiomas

- Italiano é a experiência comercial principal.
- Inglês é suportado como idioma internacional atual, não como “suporte futuro”.
- Português continua disponível como suporte e para operação administrativa.
- O idioma é detectado na mensagem atual do cliente; uma troca de idioma é seguida no próximo turno.
- O idioma configurado na organização/Digital Employee funciona como fallback, sem bloquear italiano, inglês ou português.

### Identidade

- `WAI` identifica o produto.
- `organizations.name` identifica a empresa.
- `digital_employees.name` identifica o Digital Employee.
- Não existe `Chiara`, `Studio Aurora` ou nome de cliente de fixture no caminho produtivo auditado.
- A única regra de conflito de identidade que dependia de nomes de fixture foi substituída por comparação genérica entre o nome declarado e o cliente associado ao contato.

### Conversação

- A conversa mantém serviço, profissional, data, hora, nome, telefone e idioma entre turnos.
- Um canal sem `conversationId` abre uma nova conversa; ele não reaproveita silenciosamente a sessão ativa de outro cliente.
- Uma mensagem só é persistida se a conversa pertencer à mesma organização.
- Falha ao persistir mensagem interrompe o turno e impede uma resposta aparentemente bem-sucedida.
- Cancelamento e reagendamento não escolhem mais o primeiro cliente do tenant quando não há contato verificado.

### Agenda

- Criação, conflito de horário, cancelamento, reagendamento, bloqueio de agenda e timezone passaram em testes locais e no Supabase QA real.
- O GIST do banco permanece a autoridade mecânica contra double booking.
- Conversões usam o timezone da organização e rejeitam horários locais inválidos em transições de DST.
- O motivo de cancelamento é preservado no Audit Log. O esquema P1 não possui coluna `cancellation_reason`; por isso a mutação do appointment grava somente o estado `cancelled`, sem migration nova.

### Segurança e permissões

- Resolução de organização e papel parte da sessão autenticada; payload de canal não concede privilégios.
- Owner e operator podem executar mutações P1; viewer permanece somente leitura.
- O simulador mostra uma mensagem clara ao viewer em vez de tentar criar conversa e falhar de forma opaca.
- RLS está habilitado nas tabelas P0/P1/conversa e os testes reais confirmam isolamento entre organizações.
- IDs de fixture e telefones de teste permanecem somente nos testes; não controlam decisões do runtime.

### Interface

- A tela do Digital Employee usa o dicionário administrativo em vez de misturar italiano e português.
- O seletor informa corretamente italiano principal, inglês internacional e português de suporte.
- Nome da empresa e nome do Digital Employee aparecem separadamente no simulador.
- Loading, estado vazio, falha de envio e acesso viewer têm feedback explícito.
- A inspeção visual autenticada completa ainda depende da sessão do fundador e está no checklist abaixo.

## Problemas encontrados e corrigidos nesta revisão

1. Mensagens podiam apontar para uma conversa de outra organização se um UUID estrangeiro fosse fornecido. Foi adicionada validação organização–conversa antes do insert.
2. Cancelamento/reagendamento sem identidade verificada podia selecionar o primeiro cliente do tenant. O fallback foi removido e agora retorna `CUSTOMER_IDENTITY_REQUIRED` no idioma do cliente.
3. Cancelamento tentava gravar `cancellation_reason`, coluna ausente no P1. O estado agora persiste no schema real e o motivo fica no Audit Log.
4. Um canal sem ID podia reutilizar a primeira conversa ativa do mesmo canal. Agora abre uma conversa nova.
5. O detector de conflito de identidade continha nomes de fixture. A regra agora é genérica e possui regressão própria.
6. A interface apresentava inglês como suporte futuro e misturava traduções. Os textos foram alinhados ao escopo comercial atual.
7. Viewer conseguia entrar no simulador, mas encontrava erro operacional tardio. Agora recebe estado somente leitura claro e as actions recusam mutação antecipadamente.

## Pendências reais

- Checklist humano A–J ainda não executado pelo fundador.
- Inspeção visual das telas autenticadas em desktop e mobile ainda depende da sessão real do fundador.
- A validação externa opcional do Gemini não foi usada como gate. O fluxo determinístico e a persistência real são os contratos P1.
- O motivo textual de cancelamento não reaparece no appointment após reload porque o schema P1 não possui essa coluna; ele fica no Audit Log. Resolver isso exigiria migration e está fora desta tarefa.

## Riscos para o piloto

- Não expor cancelamento/reagendamento em um canal público que não vincule o remetente a um contato verificado. O simulador P1 é um workspace autenticado; conectores públicos pertencem a etapa posterior.
- Antes de convidar usuários reais, confirmar manualmente conteúdo, contraste, loading e navegação nas telas autenticadas com os dados da empresa piloto.
- Usar datas futuras dentro das regras configuradas e um telefone de teste autorizado no checklist, evitando dados pessoais reais durante a homologação.

## Status final

`READY FOR HUMAN ACCEPTANCE TEST — P1 FINAL ACCEPTANCE PENDING`

Não iniciar P2 e não declarar o P1 concluído até o fundador registrar o resultado do checklist A–J.

## O que o fundador deve testar agora

Para qualquer falha, registre também ambiente, navegador, data/hora, organização/slug, papel do usuário e screenshot. Nunca envie senha ou chave de API.

### A. Login

- **Ação:** abrir a URL do WAI em janela privada, entrar com o usuário owner da empresa piloto, sair e entrar novamente. Repetir com operator e viewer, se disponíveis.
- **Resultado esperado:** login leva apenas à organização autorizada; logout encerra a sessão; owner/operator veem ações operacionais; viewer vê telas somente leitura e não envia mensagens no simulador.
- **Se falhar, coletar:** URL antes/depois, papel esperado, texto exato do erro, status HTTP visível no Network e screenshot.

### B. Empresa

- **Ação:** em Empresa, alterar temporariamente nome para `Empresa Piloto WAI QA`, endereço para `Via Pilota 10`, telefone para um número de teste autorizado, email de teste e horário para `Lun–Ven 09:00–18:00`; salvar, recarregar e depois restaurar os dados corretos.
- **Resultado esperado:** mensagem de sucesso; dados persistem após reload; o novo nome aparece como empresa no header, sem mudar o nome do Digital Employee.
- **Se falhar, coletar:** campo que não persistiu, valor anterior/novo, mensagem exibida, horário do teste e screenshot antes/depois do reload.

### C. Digital Employee

- **Ação:** definir um nome próprio para o Digital Employee que seja diferente da empresa, salvar e recarregar. Depois iniciar conversas novas e enviar exatamente:
  - Italiano: `Vorrei prenotare una consulenza fiscale`
  - Inglês: `I would like to book a tax consultation`
  - Português: `Gostaria de marcar uma consulta fiscal`
  - Troca de idioma, após iniciar em italiano: `Actually, please continue in English.`
- **Resultado esperado:** o nome configurado aparece no chat; cada resposta usa o idioma da mensagem; a primeira resposta inicia o booking e pede a data; a troca para inglês mantém o contexto já coletado.
- **Se falhar, coletar:** conversa completa em ordem, nome do Digital Employee, idioma fallback configurado, intent e tool calls exibidos no Inspector, screenshot.

### D. Booking

- **Ação:** garantir que exista serviço fiscal ativo, profissional ativo e disponibilidade futura. Em uma conversa nova, enviar a mensagem italiana de C; responder com uma data futura aberta; escolher exatamente um horário oferecido; quando solicitado, enviar `Mi chiamo NOME COGNOME e il mio numero è TELEFONO_DI_TESTE`.
- **Resultado esperado:** antes da data não há confirmação; depois da data aparecem horários reais; antes da identidade não há confirmação; a confirmação final mostra data/hora e só aparece após criação real. Copiar o ID do appointment no Inspector, se disponível.
- **Se falhar, coletar:** todas as mensagens, slots oferecidos, serviço/profissional, timezone, ordem de `checkAvailability` e `createAppointment`, resultado/código de cada tool call e ID retornado.

### E. Calendar

- **Ação:** abrir Calendar no mês do booking criado em D, localizar o dia e abrir o appointment.
- **Resultado esperado:** cliente, serviço, profissional, início, fim e status `confirmed` correspondem à conversa; dia e hora são exibidos no timezone da empresa; não há duplicação nem tela vazia inesperada.
- **Se falhar, coletar:** mês aberto, timezone mostrado, ID do appointment, valores da conversa versus Calendar e screenshot.

### F. Cancelamento

- **Ação:** na mesma conversa do booking, enviar `Vorrei cancellare il mio appuntamento.`. Se abrir uma conversa nova, informar o contato de teste verificado quando solicitado. Confirmar também pelo detalhe do Calendar, se desejado.
- **Resultado esperado:** sem contato verificado o sistema pede identidade e não escolhe outro cliente; com identidade correta retorna cancelamento; após reload o appointment aparece `cancelled` e o slot fica livre.
- **Se falhar, coletar:** contato mascarado usado, conversa completa, appointment ID, tool code, estado antes/depois e Audit Log/correlation ID disponível.

### G. Reagendamento

- **Ação:** criar outro booking futuro; enviar `Vorrei spostare il mio appuntamento.` e, quando solicitado, informar uma nova data e hora disponível.
- **Resultado esperado:** nenhuma confirmação sem nova data/hora; ao concluir, o mesmo appointment passa ao novo horário; o horário antigo fica livre e o novo fica ocupado.
- **Se falhar, coletar:** appointment ID, início antigo/novo, respostas, tool code, timezone e screenshots dos dois dias no Calendar.

### H. Bloqueio de agenda

- **Ação:** criar um bloqueio de dia inteiro em data futura com motivo `Blocco pilot QA`; verificar disponibilidade dessa data no chat; depois remover o bloqueio.
- **Resultado esperado:** o bloqueio aparece visualmente no Calendar; Chiara não oferece horários bloqueados; após remoção, horários configurados voltam a aparecer.
- **Se falhar, coletar:** intervalo e timezone do bloqueio, motivo, profissional/organização afetado, slots oferecidos antes/depois, tool result e screenshot.

### I. Perguntas do proprietário

- **Ação:** no simulador autenticado como owner/operator, enviar `Who do I have on DATA_DO_BOOKING?` e `Chi ho in agenda il DATA_DO_BOOKING?`.
- **Resultado esperado:** resposta no idioma da pergunta usando somente appointments reais da organização; nenhum telefone de cliente é necessário; viewer não executa a consulta operacional.
- **Se falhar, coletar:** papel do usuário, pergunta exata, data, resposta, lista real no Calendar, intent/tool call e screenshot.

### J. Segurança entre empresas

- **Ação:** com duas empresas de teste A e B, entrar como owner A e tentar abrir pela URL o slug de B; conferir também Services, Professionals, CRM, Calendar, Digital Employee e conversa. Repetir a tentativa inversa com owner B.
- **Resultado esperado:** acesso negado ou lista vazia segura; nenhuma leitura ou mutação cruza empresas; dados de A permanecem inalterados após tentativas usando B.
- **Se falhar, coletar:** slugs A/B, usuário e papel sem dados secretos, URL tentada, módulo, ID do registro exposto/alterado, resposta HTTP/RLS, correlation ID e screenshot.
