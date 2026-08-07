# Piano di Test per Chiara (Assistente WAI) - Studio Aurora

## Obiettivo
Validare se l'assistente virtuale Chiara (Studio Aurora) gestisce correttamente conversazioni reali in italiano, rispetta i vincoli di pianificazione, riconosce informazioni aziendali ed elabora input in linguaggio naturale.

---

## 1. Dati del Tenant (Studio Aurora)
Questi dati sono popolati nel database di test e devono essere restituiti o usati da Chiara durante i test:
- **Nome Azienda:** Studio Aurora
- **Indirizzo:** Via dei Mille 10, Milano (MI)
- **Telefono Ufficio:** +39 02 1234567
- **WhatsApp Ufficio:** +39 340 1122333
- **Orario di Apertura:** Lun-Ven 09:00 - 18:00 (Venerdì fino alle 17:00). Sabato e Domenica chiuso.
- **Servizi Offerti:**
  1. *Consulenza Fiscale Iniziale* (Durata: 45 min, Prezzo: €120, Buffer post-appuntamento: 15 min)
  2. *Revisione Bilancio Annuale* (Durata: 60 min, Prezzo: €180, Buffer post-appuntamento: 15 min)
- **Professionisti:**
  1. *Dott. Marco Rossi* (Titolare / Commercialista)
  2. *Dott.ssa Sofia Bianchi* (Esperta Contabile)

---

## 2. Casi di Test Funzionali e Scenari

### Caso 1: Flusso Guidato Completo (Happy Path)
- **Intenzione:** Il cliente vuole prenotare una consulenza.
- **Input utente:** *"Vorrei prenotare un appuntamento"*
- **Comportamento atteso:**
  1. Chiara risponde mostrando i servizi disponibili tramite cards o chiedendo il servizio.
  2. Il cliente seleziona *"Consulenza Fiscale Iniziale"*.
  3. Chiara chiede di scegliere un professionista (*"Dott. Marco Rossi"*, *"Dott.ssa Sofia Bianchi"* o *"Il primo disponibile"*).
  4. Il cliente seleziona *"Il primo disponibile"*.
  5. Chiara mostra gli slot orari liberi per i prossimi giorni.
  6. Il cliente seleziona uno slot (es: Lunedì alle 11:30).
  7. Si apre il modulo conversazionale guidato:
     - **Input Nome:** Inserire *"Giovanni"*
     - **Input Cognome:** Inserire *"Verdi"*
     - **Input WhatsApp:** Scegliere prefisso `+39` e inserire `3401122333`.
  8. Chiara mostra il riepilogo "CONFERMA PRENOTAZIONE" con i dettagli strutturati.
  9. Il cliente clicca su **[ Conferma prenotazione ]**.
- **Criterio di successo:** Il sistema salva l'appuntamento nel database e visualizza la conferma *"Prenotazione confermata per il YYYY-MM-DD alle ore HH:MM"*.

### Caso 2: Rilevamento automatico del servizio in linguaggio naturale
- **Intenzione:** Il cliente specifica il servizio direttamente nel primo messaggio.
- **Input utente:** *"Ciao, vorrei fare una consulenza fiscale"*
- **Comportamento atteso:** Chiara rileva direttamente il servizio *"Consulenza Fiscale Iniziale"* (senza chiederlo di nuovo) e propone direttamente la scelta del professionista o gli orari disponibili.
- **Criterio di successo:** Chiara salta la domanda di scelta del servizio.

### Caso 3: Test dei Conflitti e Overlap (Anti-Overlap GIST & Buffer)
- **Scenario pre-caricato:** Il Dott. Marco Rossi ha un appuntamento il 10 Agosto 2026 dalle 09:00 alle 09:45 (Consulenza Fiscale Iniziale, buffer 15m). Quindi lo studio è occupato/bloccato fino alle 10:00. Ha anche un appuntamento dalle 10:00 alle 11:00 (Revisione Bilancio, buffer 15m), occupato fino alle 11:15.
- **Test di prenotazione:** Tentare di prenotare alle 09:30 o alle 10:15 di lunedì 10 Agosto.
- **Comportamento atteso:** Gli orari dalle 09:00 alle 11:15 non devono essere mostrati come slot disponibili per il Dott. Marco Rossi.
- **Criterio di successo:** Chiara propone solo orari a partire dalle 11:30 in poi per quel professionista su quel giorno.

### Caso 4: Risposte ad Informazioni Generali (FAQ)
Chiara deve poter indirizzare il cliente verso le informazioni della struttura usando i bottoni di navigazione rapidi del simulatore (`[WAI_STEP_INFO]`):
- Cliccando su **Orari**: Chiara mostra i dettagli degli orari.
- Cliccando su **Indirizzo**: Chiara risponde indicando l'indirizzo dello studio (*"Via dei Mille 10, Milano (MI)"*).
- Cliccando su **Telefono**: Chiara risponde con il contatto telefonico (*"+39 02 1234567"*).
- Cliccando su **Servizi/Prezzi**: Chiara elenca i servizi e il listino prezzi.

### Caso 5: Errori Umani ed Eccezioni
1. **Nome o Cognome vuoti:** Inviare spazi vuoti durante la digitazione del form. Il sistema non deve consentire di premere "Continua".
2. **Numero di telefono non valido:** Digitare un numero troppo corto (es. `123`) o in formato palesemente errato.
   - **Comportamento atteso:** Chiara rileva l'errore e risponde: *"Il numero WhatsApp non sembra corretto. Controllalo e riprova."* rimanendo nello step del telefono.

---

## 3. Criteri di Accettazione dell'Assistente
- **Zero payload tecnici:** Non devono comparire stringhe come `[SLOT] 2026-08-12 ...` o codici UUID nei messaggi della conversazione.
- **Filtri Internazionali:** Il campo WhatsApp deve formattare correttamente il prefisso internazionalizzato ed esporlo chiaramente nel box di conferma.
- **Conferma esplicita:** L'utente deve confermare con "Conferma prenotazione" prima che l'appuntamento sia effettivamente inserito nel database.
