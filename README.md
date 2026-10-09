# App Apice Manutenzioni — Hotel Giò (Jazz & Wine)

App React/Vite di gestione manutenzioni per **Hotel Giò (Jazz & Wine)**, gruppo Apicehotel.
Interfaccia in italiano. Sviluppo iterativo, mobile-first.

## Stack
- **Frontend**: React 18 + Vite (single file principale `src/App.jsx`)
- **Database**: Supabase (PostgreSQL) — client in `src/db.js`
- **Hosting**: Vercel (auto-deploy da questo repo GitHub `nuovo repo GitHub (account aggiornato)`)
- **Realtime**: Supabase subscriptions per dati condivisi tra dispositivi

## Struttura file
- `src/App.jsx` — tutta l'app (login, segnalazioni, interventi, admin)
- `src/db.js` — client Supabase + layer dati (mappatura camelCase↔snake_case)
- `src/main.jsx` — entry React
- `src/index.css` — reset globale
- `index.html`, `vite.config.js`, `package.json` — config progetto

## Credenziali Supabase (chiave publishable, sicura nel frontend)
- URL: https://jmhzmwyolxzacjunfwcq.supabase.co
- Project ID: jmhzmwyolxzacjunfwcq
- Region: eu-central-1 (Frankfurt)

## Tabelle Supabase
- `utenti` (id, nome, ruolo, pin) — 4 ruoli: direzione/governante/manutentore/reception
- `tecnici` (id, nome, telefono)
- `segnalazioni` (camera, urgenza, categoria, stato, foto, tecnico esterno, attesa pezzo...)
- `interventi` (interventi pianificati con assegnatari multipli)
- RLS attivo con policy permissive; realtime abilitato su segnalazioni/interventi/tecnici

## Funzionalità principali
- Login per nome (ruolo dedotto automaticamente) + PIN 4 cifre. Admin panel (PIN admin).
- Segnalazioni: camera, urgenza, categoria, foto, stato camera. Flusso: todo→tecnico→attesa pezzo→done.
- Interventi pianificati (solo direzione), assegnazione multipla interni + tecnici esterni.
- Rubrica tecnici con link WhatsApp pre-compilato.
- "I miei lavori", backup/ripristino JSON.

## Utenti default (PIN 0000)
Direzione: Alberto, Paolo, Michele, Giovanna. Manutentore: Domenico, Mario, Aly, Gianluca, Patricio.
Governante: Giulia. Reception: Reception.

## Convenzioni
- Codice conciso, stile esistente (no librerie extra non necessarie).
- Estetica: verde bosco (#0E5C49), beige (#F4F2ED), accento oro (#B9842F).
- Mobile-first. SVG icons (oggetto `I` in App.jsx), niente emoji nell'UI.
- Testi UI in italiano.

## Workflow deploy
Modifiche → commit + push su GitHub `main` → Vercel ricostruisce da solo (~1 min).
URL produzione: https://apice-project.vercel.app

## Note
- Login session e PIN admin restano in localStorage (locali al dispositivo).
- Dati condivisi (segnalazioni, utenti, tecnici, interventi) vivono su Supabase.

## Infrastruttura — piani a pagamento (dal 12/08/2026)
- **Organizzazione Supabase "Apicehotel"**: piano **Pro** attivo (~$25/mese base +
  ~$10/mese per ogni progetto oltre il primo — oggi 2 progetti, Hotel Giò +
  Chocohotel). Sblocca: backup giornalieri automatici, niente pausa per
  inattività, oltre il limite di 2 progetti del piano gratuito.
- **Team Vercel "apicehotel"**: piano **Pro** attivo ($20/mese, un solo
  abbonamento copre tutti i progetti del team). Sblocca: uso commerciale
  regolare (Hobby lo vieta nei termini di servizio), 1TB banda/mese, deploy
  protetti da password.
- Tracciamento importi/date fatture: tool dedicato (registro-costi.html,
  consegnato all'utente, salvato nel suo account Claude).

## Sensori temperatura (aggiornato 09/10/2026)
- Edge function `sync-sensori-temperatura` (cron `*/30`): legge eWeLink con **paginazione** (API max 30 dispositivi/pagina, account con 43) e salva su `sensori_temperatura`.
- 9 sensori in whitelist (Jazz P1-P4, W Alb 1-3, risto Wine, Cella frigo). Soglia allerta default 20°C; Cella frigo 0°C (`SOGLIE_SENSORI` in App.jsx e nella function).
- UI: grigio = offline/dato vecchio (>1h, banner "Dati non aggiornati"), rosso = in allerta, verde = ok.
- Da fare: credenziali eWeLink ancora nel sorgente della function (spostare nei secrets Supabase); nessun avviso quando un sensore va offline.

## Urgenze e WhatsApp (aggiornato 09/10/2026)
- Tabella `richieste_urgenti`; trigger `invia_whatsapp_urgenza_evento()` chiama la edge function `send-urgenza-whatsapp` (Twilio, template `richiesta_urgente_manutenzione_v2`).
- Destinatari: solo manutentori con `in_struttura=true` e telefono valorizzato **in formato internazionale (+39...)**: senza prefisso Twilio risponde 63024.
- Solleciti: messaggio alla creazione + promemoria a +1, +2, +3 minuti dalla creazione, solo se la richiesta e' ancora `aperta` e non presa in carico. Cron pg_cron `solleciti-whatsapp-urgenze` ogni 15 secondi, funzione `invia_solleciti_urgenze()`, contatore `whatsapp_solleciti`. Testato il 09/10/2026 (4 messaggi consegnati).
- `whatsapp_inviato=true` significa "accettato da Twilio", non "consegnato": per lo stato reale usare `send-urgenza-whatsapp?checkSid=<MM...>`.

## Presenza "in struttura"
- Colonne su `utenti`: `in_struttura`, `in_struttura_dal`, `in_struttura_via` (manuale | gps | auto_7h20 | auto_gps_7h20).
- Timeout 7h20: manuale = timer client + job pg_cron per utente; GPS = cron `spegni-presenza-gps-scaduta` ogni 15 min. Il GPS aggiorna solo con app aperta e non sovrascrive "manuale".

## Realtime e aggiornamento dati (aggiornato 09/10/2026)
- In App.jsx il canale `apice-changes` viene ricreato su CHANNEL_ERROR/TIMED_OUT/CLOSED, al ritorno in primo piano, su focus e su evento online; in piu' polling di riserva ogni 20s a scheda visibile (segnalazioni + urgenze). Motivo: il websocket muore con l'app in background.

## Deploy — attenzione
- Produzione: https://hotelgio.vercel.app (progetto Vercel `hotelgio`, team `apicehotel`).
- Il 09/10/2026 si e' scoperto che Vercel non ricostruiva dal 09/09 nonostante i merge su `main`: verificare sempre che compaia un deploy "Ready" dopo il push (Vercel > Deployments); in caso contrario ridistribuire a mano il commit di `main` e controllare Settings > Git.
- Build locale: `npm install` fallisce in ambienti senza accesso a cdn.sheetjs.com (dipendenza `xlsx`).

## Regola di manutenzione di questo file
Questo README e' la fonte unica sul funzionamento del progetto (per persone e per qualsiasi strumento/AI). **Va aggiornato nello stesso commit di ogni modifica** a funzionalita', database, edge function, cron, deploy o infrastruttura.
