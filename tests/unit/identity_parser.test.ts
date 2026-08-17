import { describe, expect, it } from 'vitest';
import { AIProviderContext, LocalIntentRouter } from '../../src/modules/ai/local_intent_router';

const context: AIProviderContext = {
  organization: { timezone: 'Europe/Rome' },
  services: [],
  professionals: [],
  customers: [],
};

const router = new LocalIntentRouter();

const IDENTITY_CASES: Array<[input: string, firstName: string, lastName: string, customerName: string]> = [
  ['Mi chiamo Mario Rossi', 'Mario', 'Rossi', 'Mario Rossi'],
  ['Nome Mario, cognome Rossi', 'Mario', 'Rossi', 'Mario Rossi'],
  ['Nome Mario cognome Rossi', 'Mario', 'Rossi', 'Mario Rossi'],
  ['Cognome Rossi, nome Mario', 'Mario', 'Rossi', 'Mario Rossi'],
  ['Mario Rossi', 'Mario', 'Rossi', 'Mario Rossi'],
  ['Mi chiamo Mario Rossi, telefono +39 340 1234567', 'Mario', 'Rossi', 'Mario Rossi'],
  ['My name is John Smith', 'John', 'Smith', 'John Smith'],
  ['First name John, last name Smith', 'John', 'Smith', 'John Smith'],
];

describe('Parser de identidade do cliente', () => {
  for (const [input, firstName, lastName, customerName] of IDENTITY_CASES) {
    it(`extrai identidade de "${input}"`, () => {
      const route = router.route(input, context);
      expect(route.entities.requestedCustomerFirstName).toBe(firstName);
      expect(route.entities.requestedCustomerLastName).toBe(lastName);
      expect(route.entities.requestedCustomerName).toBe(customerName);
    });
  }

  it('não extrai identidade de mensagens sem nome', () => {
    const route = router.route('Vorrei prenotare una visita per domani', context);
    expect(route.entities.requestedCustomerFirstName).toBeUndefined();
    expect(route.entities.requestedCustomerLastName).toBeUndefined();
  });
});
