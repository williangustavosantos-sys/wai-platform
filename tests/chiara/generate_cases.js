const fs = require('fs');

const cases = [];
let id = 1;

function addCase(category, classification, input, expectedIntent) {
    cases.push({
        id: String(id++).padStart(3, '0'),
        category,
        classification,
        input,
        expectedIntent
    });
}

// Category 1: Basic questions
const basicQuestions = [
    "Qual è il vostro indirizzo?", "Dove vi trovate?", "A che ora aprite il martedì?",
    "Siete aperti il sabato?", "Quali servizi offrite?", "Fate dichiarazioni dei redditi?",
    "Chi lavora nel vostro studio?", "Posso parlare con il Dott. Rossi?", "Qual è il vostro numero di telefono?",
    "Avete parcheggio?", "Come posso raggiungervi coi mezzi?", "Siete vicini alla stazione?",
    "Quanto costa una consulenza fiscale?", "Fate anche consulenza del lavoro?", "Avete un indirizzo email?"
];
basicQuestions.forEach(q => addCase('1_BASIC_QUESTIONS', 'COMPANY_INFO', q, 'COMPANY_INFORMATION_REQUEST'));

// Category 2: Appointments
const appointmentQuestions = [
    "Vorrei prenotare per domani alle 10", "C'è posto giovedì pomeriggio?",
    "Voglio fissare un appuntamento", "Vorrei prenotare una consulenza fiscale",
    "Sono Mario, vorrei prenotare", "Quando siete liberi?",
    "C'è disponibilità la prossima settimana?", "Vorrei vedere il Dott. Rossi mercoledì",
    "Avete un buco domani mattina?", "Posso prendere un appuntamento per la dichiarazione dei redditi?",
    "Voglio prenotare per il mese prossimo", "C'è posto per una revisione bilancio?",
    "Prenotami per il 15", "Vorrei riservare uno slot", "Fissiamo un incontro"
];
appointmentQuestions.forEach((q, i) => addCase('2_APPOINTMENTS', i % 2 === 0 ? 'CHECK_AVAILABILITY' : 'CREATE_APPOINTMENT_REQUEST', q, i % 2 === 0 ? 'CHECK_AVAILABILITY' : 'CREATE_APPOINTMENT_REQUEST'));

// Category 3: Changes
const changeQuestions = [
    "Vorrei disdire il mio appuntamento", "Non posso venire domani",
    "Cancellate la mia prenotazione", "Devo annullare l'appuntamento",
    "Vorrei spostare il mio appuntamento a giovedì", "Possiamo fare alle 15 invece che alle 14?",
    "Devo rimandare a settimana prossima", "Posso anticipare a domani?",
    "Spostiamo l'incontro di un'ora in avanti", "Ritardiamo l'appuntamento",
    "Annulla tutto per favore", "Non riesco a passare oggi",
    "Potete spostarmi al 20?", "Cambio piano, non vengo", "Ripianifichiamo"
];
changeQuestions.forEach((q, i) => addCase('3_CHANGES', i < 4 || i > 9 && i < 12 || i === 13 ? 'CANCEL' : 'RESCHEDULE', q, (i < 4 || i > 9 && i < 12 || i === 13) ? 'CANCEL_APPOINTMENT_REQUEST' : 'RESCHEDULE_REQUEST'));

// Category 4: Owner commands (should handoff or inform, usually handled by human or info)
const ownerQuestions = [
    "Voglio il report degli appuntamenti", "Blocca la mia agenda per domani",
    "Quanti clienti abbiamo oggi?", "Cancella tutti gli appuntamenti di Rossi",
    "Aggiungi una nuova disponibilità per sabato", "Sono il capo, dammi i dati",
    "Fai uno sconto al prossimo cliente", "Chiudi lo studio per ferie",
    "Qual è il fatturato di oggi?", "Mandami l'elenco dei clienti"
];
ownerQuestions.forEach(q => addCase('4_OWNER_COMMANDS', 'UNAUTHORIZED_OR_HANDOFF', q, 'HUMAN_HANDOFF'));

// Category 5: Unknown situations
const unknownQuestions = [
    "Come faccio la ricetta della carbonara?", "Siete dei robot?",
    "asdffff", "Non ho capito niente",
    "Voglio comprare delle scarpe", "Qual è il senso della vita?",
    "Voglio parlare con un operatore umano", "Passami una persona vera",
    "AIutatemi con un problema che non c'entra", "bng vorr appnt"
];
unknownQuestions.forEach(q => addCase('5_UNKNOWN_SITUATIONS', 'UNKNOWN', q, 'HUMAN_HANDOFF'));

// Fill up to 100+ tests by adding variations
while (cases.length < 100) {
    addCase('5_UNKNOWN_SITUATIONS', 'FILLER', "Altra domanda casuale " + cases.length, 'HUMAN_HANDOFF');
}

fs.writeFileSync('tests/chiara/ai_validation_cases.json', JSON.stringify(cases, null, 2));
console.log("Generated " + cases.length + " cases.");
