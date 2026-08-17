import { afterAll, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { processConversationTurn } from '@/modules/conversation/conversation.service';
import { WebChatAdapter } from '@/modules/conversation/webchat_adapter';
import { createMockClients, getInitialStores, ORG_ID } from '../chiara/mocks/supabase.mock';
import type { MockStores } from '../chiara/mocks/supabase.mock';
import { SCENARIOS } from './scenarios';
import type { ConversationScenario, ConversationTurn, DbCheckContext } from './scenarios';

interface TurnResult {
  index: number;
  passed: boolean;
  failures: string[];
  actualIntent?: string;
  actualFlowStep?: string;
  actualOutcome?: string;
  actualStructuredContent?: string;
  actualPolicy?: string;
}

interface ScenarioResult {
  id: string;
  categoria: string;
  descricao: string;
  status: 'PASS' | 'FAIL';
  failures: string[];
  turns: TurnResult[];
  regrasValidar: string[];
}

type SelectionLike = ConversationTurn['selection'];

function resolveSelection(turn: ConversationTurn, prevMetadata: Record<string, any> | undefined): SelectionLike {
  if (turn.selection) return turn.selection;
  if (turn.pickAction) {
    const card = prevMetadata?.structuredContent as { actions?: Array<{ id: string; label: string }> } | undefined;
    const action = card?.actions?.find((a) => a.id === turn.pickAction);
    if (!action) {
      throw new Error(`Ação "${turn.pickAction}" não encontrada no card anterior (ações: ${JSON.stringify(card?.actions?.map((a) => a.id))})`);
    }
    return { type: turn.pickAction, id: action.id, label: action.label };
  }
  if (turn.pickOption) {
    const card = prevMetadata?.structuredContent as { options?: Array<{ id: string; label: string; payload?: Record<string, any> }> } | undefined;
    const options = card?.options || [];
    let option = turn.pickOption.matchId
      ? options.find((o) => o.id === turn.pickOption!.matchId)
      : options[turn.pickOption.index ?? 0];
    if (!option) {
      throw new Error(`Opção ${JSON.stringify(turn.pickOption)} não encontrada nas opções (${JSON.stringify(options.map((o) => o.id))})`);
    }
    return { type: turn.pickOption.type, id: option.id, label: option.label, payload: option.payload };
  }
  return undefined;
}

function assertTurn(
  turn: ConversationTurn,
  metadata: Record<string, any>,
  replyText: string,
  stores: MockStores,
  conversationId: string,
  initialAppointments: number,
  initialCustomers: number,
): string[] {
  const failures: string[] = [];
  const e = turn.expected;

  const actualIntent = metadata.intent ?? 'NONE';
  if (e.intent && actualIntent !== e.intent) {
    failures.push(`intent esperada ${e.intent}, recebida ${actualIntent}`);
  }
  const actualFlow = metadata.flowStep ?? 'NONE';
  if (e.flowStep && actualFlow !== e.flowStep) {
    failures.push(`flowStep esperado ${e.flowStep}, recebido ${actualFlow}`);
  }
  const actualOutcome = metadata.outcomeCode ?? 'NONE';
  if (e.outcomeCode && actualOutcome !== e.outcomeCode) {
    failures.push(`outcomeCode esperado ${e.outcomeCode}, recebido ${actualOutcome}`);
  }
  const actualCard = metadata.structuredContent?.type ?? 'NONE';
  if (e.structuredContentType && actualCard !== e.structuredContentType) {
    failures.push(`structuredContent esperado ${e.structuredContentType}, recebido ${actualCard}`);
  }
  const actualPolicy = metadata.policyDecision?.code;
  if (e.policyCode && actualPolicy !== e.policyCode) {
    failures.push(`policyCode esperado ${e.policyCode}, recebido ${actualPolicy ?? 'NONE'}`);
  }
  if (e.language && metadata.customerLanguage !== e.language) {
    failures.push(`idioma esperado ${e.language}, recebido ${metadata.customerLanguage}`);
  }

  const replyLower = (replyText || '').toLowerCase();
  for (const expected of e.replyIncludes || []) {
    if (!replyLower.includes(expected.toLowerCase())) {
      failures.push(`resposta não contém "${expected}"`);
    }
  }
  for (const forbidden of e.replyForbidden || []) {
    if (replyLower.includes(forbidden.toLowerCase())) {
      failures.push(`resposta contém termo proibido "${forbidden}"`);
    }
  }

  if (e.noDbMutation) {
    if (stores.appointmentsStore.length !== initialAppointments) {
      failures.push(`mutação indevida de agendamentos (${initialAppointments} → ${stores.appointmentsStore.length})`);
    }
    if (stores.customersStore.length !== initialCustomers) {
      failures.push(`mutação indevida de clientes (${initialCustomers} → ${stores.customersStore.length})`);
    }
  }

  if (e.dbCheck) {
    try {
      const ctx: DbCheckContext = {
        stores,
        metadata,
        replyText,
        initialAppointments,
        initialCustomers,
        conversationId,
      };
      e.dbCheck(ctx);
    } catch (err: any) {
      failures.push(`verificação de banco: ${err?.message || String(err)}`);
    }
  }

  return failures;
}

async function runScenario(scenario: ConversationScenario): Promise<ScenarioResult> {
  const stores = getInitialStores();
  scenario.setup?.(stores);
  const mocks = createMockClients(stores);
  const adapter = new WebChatAdapter();
  const conversationId = `conv-qa-${scenario.id}`;

  stores.conversationsStore.push({
    id: conversationId,
    organization_id: ORG_ID,
    customer_id: null,
    channel: 'webchat',
    status: 'active',
    workflow_state: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const initialAppointments = stores.appointmentsStore.length;
  const initialCustomers = stores.customersStore.length;

  let lastMetadata: Record<string, any> | undefined;
  const turns: TurnResult[] = [];

  for (let i = 0; i < scenario.conversa.length; i++) {
    const turn = scenario.conversa[i];
    const failures: string[] = [];
    let actual: Record<string, any> | undefined;

    try {
      const selection = resolveSelection(turn, lastMetadata);
      const payload: Record<string, any> = {
        conversationId,
        text: turn.text || '',
        customerPhone: turn.customerPhone,
      };
      if (selection) payload.selection = selection;

      const result = await processConversationTurn(
        mocks.userClient,
        mocks.adminClient,
        'user-admin-aurora',
        'studio-aurora',
        adapter,
        payload,
        `corr-qa-${scenario.id}-${i}`,
      );
      lastMetadata = (result.metadata || {}) as Record<string, any>;
      actual = lastMetadata;
      failures.push(...assertTurn(turn, lastMetadata, result.replyText, stores, conversationId, initialAppointments, initialCustomers));
    } catch (err: any) {
      failures.push(`exceção: ${err?.message || String(err)}`);
    }

    turns.push({
      index: i,
      passed: failures.length === 0,
      failures,
      actualIntent: actual?.intent,
      actualFlowStep: actual?.flowStep,
      actualOutcome: actual?.outcomeCode,
      actualStructuredContent: actual?.structuredContent?.type,
      actualPolicy: actual?.policyDecision?.code,
    });
  }

  // Scenario-level contract (final turn).
  const scenarioFailures: string[] = [];
  const finalMetadata = lastMetadata || {};
  if (finalMetadata.intent !== scenario.expectedIntent) {
    scenarioFailures.push(`intent final esperada ${scenario.expectedIntent}, recebida ${finalMetadata.intent}`);
  }
  if ((finalMetadata.flowStep ?? 'NONE') !== scenario.expectedFlowStep) {
    scenarioFailures.push(`flowStep final esperado ${scenario.expectedFlowStep}, recebido ${finalMetadata.flowStep ?? 'NONE'}`);
  }
  if ((finalMetadata.structuredContent?.type ?? 'NONE') !== scenario.expectedStructuredContent) {
    scenarioFailures.push(`structuredContent final esperado ${scenario.expectedStructuredContent}, recebido ${finalMetadata.structuredContent?.type ?? 'NONE'}`);
  }
  if ((finalMetadata.outcomeCode ?? 'NONE') !== scenario.expectedOutcome) {
    scenarioFailures.push(`outcomeCode final esperado ${scenario.expectedOutcome}, recebido ${finalMetadata.outcomeCode ?? 'NONE'}`);
  }

  const allFailures = [
    ...turns.flatMap((t) => t.failures.map((f) => `[turno ${t.index}] ${f}`)),
    ...scenarioFailures.map((f) => `[contrato final] ${f}`),
  ];

  return {
    id: scenario.id,
    categoria: scenario.categoria,
    descricao: scenario.descricao,
    status: allFailures.length === 0 ? 'PASS' : 'FAIL',
    failures: allFailures,
    turns,
    regrasValidar: scenario.regrasValidar,
  };
}

const FIELD_TO_MODULE: Array<[RegExp, string]> = [
  [/intent/, 'src/modules/ai/local_intent_router.ts'],
  [/flowStep/, 'src/modules/conversation/booking.flow.ts'],
  [/structuredContent|resposta|termo proibido/, 'src/modules/ai/deterministic_response_generator.ts'],
  [/outcomeCode/, 'src/modules/conversation/conversation.service.ts / src/modules/tools/tools.service.ts'],
  [/policyCode/, 'src/modules/ai/local_intent_router.ts / src/modules/conversation/conversation.service.ts'],
  [/idioma/, 'src/modules/conversation/customer_language.ts'],
  [/banco|mutação/, 'src/modules/tools/tools.service.ts / src/modules/calendar/calendar.service.ts / src/modules/crm/crm.service.ts'],
  [/exceção/, 'src/modules/conversation/conversation.service.ts'],
];

const FIELD_TO_SUGGESTION: Array<[RegExp, string]> = [
  [/intent/, 'Revisar as regras de classificação no LocalIntentRouter (sinais de booking/FAQ/segurança) para o input em questão.'],
  [/flowStep/, 'Ajustar a máquina de estados determinística em booking.flow.ts para o passo esperado (ordem e condições de skip).'],
  [/structuredContent/, 'Ajustar a renderização do card no DeterministicResponseGenerator para o flowStep correspondente.'],
  [/outcomeCode/, 'Alinhar o código de outcome derivado (create/check/cancel/reschedule) no conversation.service e nas ferramentas.'],
  [/policyCode/, 'Garantir que a regra de segurança dispara no router e bloqueia tool calls no conversation.service.'],
  [/idioma/, 'Ajustar os padrões de detecção de idioma em customer_language.ts (fallback por histórico).'],
  [/banco|mutação/, 'Corrigir a ferramenta responsável para persistir (ou não persistir) conforme o resultado operacional.'],
  [/exceção/, 'Investigar a exceção no conversation.service (mock de Supabase incompleto ou validação quebrada).'],
  [/resposta não contém/, 'Corrigir o texto humanizado no DeterministicResponseGenerator (copy por idioma).'],
];

function locateModule(failure: string): string {
  const match = FIELD_TO_MODULE.find(([pattern]) => pattern.test(failure));
  return match ? match[1] : 'src/modules/conversation/conversation.service.ts';
}

function suggestFix(failure: string): string {
  const match = FIELD_TO_SUGGESTION.find(([pattern]) => pattern.test(failure));
  return match ? match[1] : 'Comparar o contrato esperado com o comportamento real e corrigir a causa raiz no módulo responsável.';
}

function writeReport(results: ScenarioResult[], durationMs: number): void {
  const total = results.length;
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;

  const byCategory = new Map<string, { total: number; passed: number; failed: number }>();
  for (const r of results) {
    const entry = byCategory.get(r.categoria) || { total: 0, passed: 0, failed: 0 };
    entry.total += 1;
    if (r.status === 'PASS') entry.passed += 1;
    else entry.failed += 1;
    byCategory.set(r.categoria, entry);
  }

  const failures = results.filter((r) => r.status === 'FAIL');
  const lines: string[] = [];
  lines.push('# WAI CONVERSATION QA REPORT');
  lines.push('');
  lines.push(`> Gerado automaticamente pela suíte de conversas reais do Digital Employee (${results.length} cenários).`);
  lines.push('');
  lines.push('## Resumo');
  lines.push('');
  lines.push(`- **Quantidade de testes:** ${total}`);
  lines.push(`- **Aprovados:** ${passed}`);
  lines.push(`- **Falhados:** ${failed}`);
  lines.push(`- **Taxa de aprovação:** ${total ? ((passed / total) * 100).toFixed(1) : '0.0'}%`);
  lines.push(`- **Duração:** ${durationMs}ms`);
  lines.push('');
  lines.push('## Resultado por categoria');
  lines.push('');
  lines.push('| Categoria | Total | Aprovados | Falhados |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const [categoria, entry] of [...byCategory.entries()].sort()) {
    lines.push(`| ${categoria} | ${entry.total} | ${entry.passed} | ${entry.failed} |`);
  }
  lines.push('');

  if (failures.length === 0) {
    lines.push('## Falhas');
    lines.push('');
    lines.push('Nenhuma. Todos os cenários passaram.');
    lines.push('');
    lines.push('## Decisão final');
    lines.push('');
    lines.push('**AUTOMATED REGRESSION PASS** — o Digital Employee está pronto para validação humana/piloto.');
  } else {
    lines.push('## Falhas');
    lines.push('');
    for (const f of failures) {
      lines.push(`### ${f.id} (${f.categoria})`);
      lines.push('');
      lines.push(`- **Descrição:** ${f.descricao}`);
      lines.push(`- **Regras validadas:** ${f.regrasValidar.join('; ')}`);
      for (const failure of f.failures) {
        lines.push(`- **Motivo:** ${failure}`);
        lines.push(`  - **Arquivo responsável:** ${locateModule(failure)}`);
        lines.push(`  - **Sugestão de correção:** ${suggestFix(failure)}`);
      }
      lines.push('');
    }
    lines.push('## Decisão final');
    lines.push('');
    lines.push('**AUTOMATED REGRESSION FAIL** — corrigir as falhas listadas antes de entregar para a clínica.');
  }

  const reportPath = path.join(__dirname, '..', '..', 'WAI_CONVERSATION_QA_REPORT.md');
  fs.writeFileSync(reportPath, lines.join('\n').trimEnd() + '\n');
}

describe('QA Automatizada — Conversas Reais do Digital Employee', () => {
  const results: ScenarioResult[] = [];
  const startedAt = Date.now();

  for (const scenario of SCENARIOS) {
    it(`[${scenario.id}] ${scenario.descricao}`, async () => {
      const result = await runScenario(scenario);
      results.push(result);
      if (result.status === 'FAIL') {
        // Fails the vitest assertion with the root-cause detail in the message.
        expect(result.failures).toEqual([]);
      } else {
        expect(result.status).toBe('PASS');
      }
    });
  }

  afterAll(() => {
    writeReport(results, Date.now() - startedAt);
    const passed = results.filter((r) => r.status === 'PASS').length;
    const total = results.length;
    // eslint-disable-next-line no-console
    console.log(`\n[QA] WAI Conversation: ${passed}/${total} cenários aprovados. Relatório: WAI_CONVERSATION_QA_REPORT.md`);
  });
});
