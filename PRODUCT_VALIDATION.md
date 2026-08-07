# WAI Platform MVP Validation

## Objetivo
Validar se empresas conseguem utilizar a assistente Chiara para atender clientes e gerar agendamentos reais.

## Estado atual do MVP
O MVP está funcional, robusto, isolado por tenant e validado com testes unitários e de integração abrangendo:
- **Escolha de serviço**: Reconhecimento automático ou seleção via cards dinâmicos caso existam múltiplas opções ativas.
- **Escolha de horário**: Exibição dos próximos horários disponíveis de forma automática, eliminando a digitação manual de semana/data.
- **Coleta de nome**: Campo e card estruturado simplificado salvando apenas o primeiro nome próprio do cliente.
- **Coleta de sobrenome**: Campo e card estruturado separado salvando apenas o sobrenome (Cognome).
- **WhatsApp internacional com DDI**: Seletor com busca inteligente por país e validação internacional que não assume por padrão a Itália.
- **Confirmação final**: Card detalhado ("CONFERMA PRENOTAZIONE") apresentando dados do agendamento de forma polida e limpa, permitindo confirmar, modificar ou anular.
- **Testes automatizados passando**: Cobertura de testes unitários de regras de negócio, RLS, segurança e fluxo de conversa 100% verde (35/35).

## Testes obrigatórios

### Fluxo de agendamento
- [ ] Cliente inicia conversa
- [ ] Cliente escolhe serviço
- [ ] Cliente escolhe horário
- [ ] Cliente informa nome
- [ ] Cliente informa sobrenome
- [ ] Cliente informa WhatsApp
- [ ] Cliente confirma reserva

### Testes de linguagem natural
Exemplos de intenções mapeadas para teste em ambiente real:
- *"Vorrei prendere un appuntamento"* (Reserva rápida)
- *"Avete disponibilità domani?"* (Verificação de agenda)
- *"Quanto costa una consulenza?"* (Preço do serviço)
- *"Dove siete?"* (Localização / Informações)
- *"Vorrei parlare con una persona"* (Transbordo / Ajuda)

## Próxima fase
O objetivo principal agora é focar na validação prática do MVP com usuários e empresas reais para responder às seguintes hipóteses de produto:
1. **Pessoas entendem o fluxo?** O formulário e a interação conversacional guiam usuários de forma intuitiva?
2. **Empresas economizam tempo?** O assistente mitiga trocas manuais de mensagens?
3. **O dono da clínica confiaria na assistente?** A IA agenda apenas horários permitidos e válidos sem duplicidades?
4. **Existe disposição para pagar?** A dor do agendamento é grande o suficiente para justificar a monetização do produto?
