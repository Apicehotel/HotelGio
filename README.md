# App Apice Manutenzioni — Hotel Giò (Jazz & Wine)

App web (PWA) per la gestione delle manutenzioni di **Hotel Giò (Jazz & Wine)**, gruppo Apicehotel. Interfaccia in italiano, pensata per smartphone. Raccoglie segnalazioni di guasti, interventi pianificati, richieste urgenti, planning delle sale e dei lavori, tabellone pulizie camere e monitoraggio delle temperature.

> **Regola di manutenzione:** questo README e' la fonte unica sul funzionamento del progetto (per persone e per qualsiasi strumento/AI). Va aggiornato **nello stesso commit** di ogni modifica a funzionalita', database, edge function, cron, deploy o infrastruttura. Non vi vanno scritti dati sensibili (PIN, chiavi, token, numeri di telefono, email).

---

## 1. Stack e infrastruttura

| Componente | Dettaglio |
|---|---|
| Frontend | React 18 + Vite, PWA (service worker, manifest, notifiche push) |
| Database / Auth dati | Supabase (PostgreSQL), progetto `jmhzmwyolxzacjunfwcq`, regione eu-central-1 |
| Realtime | Supabase Realtime (`postgres_changes`) per dati condivisi tra dispositivi |
| Backend | Supabase Edge Functions (Deno) + funzioni PL/pgSQL + pg_cron + pg_net |
| Messaggistica | Twilio WhatsApp (template approvati) e Web Push |
| Sensori | eWeLink / CoolKit (sensori di temperatura) |
| Hosting | Vercel, progetto `hotelgio`, team `apicehotel` — https://hotelgio.vercel.app |
| Repo | GitHub `Apicehotel/HotelGio`, branch `main` |
| Offline | IndexedDB (Dexie) per il tabellone camere; coda locale per le segnalazioni |

Piani a pagamento attivi: Supabase **Pro** (organizzazione "Apicehotel", backup giornalieri, nessuna pausa per inattivita') e Vercel **Pro** (team "apicehotel"). Le fatture sono tracciate con uno strumento separato.

La chiave Supabase usata nel frontend e' una chiave *publishable* (pubblica per progetto). La sicurezza dei dati poggia su RLS (attiva su tutte le tabelle, con policy permissive: la protezione effettiva e' il login a PIN dell'app). Nessun segreto va scritto nel repo: i segreti server-side stanno nei secrets delle Edge Functions.

## 2. Struttura del repository

```
src/App.jsx           App principale (login, segnalazioni, interventi, planning, admin, ...)
src/db.js             Client Supabase + layer dati (mappatura camelCase <-> snake_case, coda offline segnalazioni)
src/Urgenza.jsx       Richieste urgenti: sirena, scheda, azioni
src/Camere.jsx        Tabellone pulizie camere (housekeeping) + caricamento file Slope
src/camereOffline.js  Cache e coda di sincronizzazione offline del tabellone camere (Dexie)
src/NotificheSettings.jsx  Pannello notifiche: push on/off e scelta suono
src/push.js           Iscrizione/disiscrizione Web Push
src/ui.jsx            Componenti UI condivisi (Sheet, Field, stili)
src/zoneData.js       Elenco ufficiale camere e zone comuni (copia da tenere allineata alla Edge Function whatsapp-webhook)
src/main.jsx, index.css  Entry React e reset globale
public/sw.js          Service worker: push, cache offline di shell e dati
public/manifest.webmanifest, favicon-*, apple-touch-icon-180.png
public/sounds/        Suoni di notifica (classico, jazz, melodia, miao)
public/manuale.pdf    Manuale utente aperto dal menu
```

Convenzioni: codice conciso nello stile esistente, nessuna libreria extra non necessaria, icone SVG (oggetto `I` in App.jsx), **niente emoji nell'UI**, testi in italiano, mobile-first. Palette: verde bosco `#0E5C49`, beige `#F4F2ED`, oro `#B9842F`.

## 3. Ruoli e permessi

Il ruolo e' dedotto dal nome utente al login (non lo sceglie la persona).

| Ruolo | Cosa fa |
|---|---|
| `direzione` | Supervisione completa, statistiche, interventi, urgenze, planning, pulizie |
| `direttore_congressi` | Come la gestione, focalizzato sul Centro Congressi (Planning Sale) |
| `reception` | Segnala, invia urgenze, carica il file Slope, gestisce planning e pulizie |
| `governante` | Segnala dalle camere, aggiorna il tabellone pulizie |
| `portiere_notturno` | Segnala di notte, carica il file Slope, vede il tabellone |
| `manutentore` | Esegue interventi, riceve le urgenze, segna i lavori del planning, "I miei lavori" |
| `responsabile_area` | Segnala solo per le proprie zone (`zone_consentite`), es. ristorante/colazioni |
| `sviluppatore` | Accesso completo, incluso Pannello Consumi e strumenti di diagnostica |

"Gestione" = direzione, direttore_congressi, reception, sviluppatore. La gestione vede segnalazioni, urgenze, interventi, planning; il manutentore vede urgenze, interventi, planning lavori; il tabellone pulizie e' visibile a governante, reception, portiere notturno, direzione, sviluppatore.

## 4. Accesso e sicurezza applicativa

- Login con **nome + PIN a 4 cifre**. Tutti gli utenti nascono con un PIN iniziale e `deve_cambiare_pin = true`: al primo accesso si e' obbligati a sceglierne uno nuovo (`ForceChangePin`). "Cambia PIN" e' nel menu.
- **Pannello Admin** protetto da un PIN amministratore (salvato in `app_config`): gestione utenti, ruoli, zone, telefoni, reset PIN.
- La sessione di login resta in `localStorage` (locale al dispositivo).
- **Auto-logout programmato** per utente tramite job pg_cron dedicati (`esegui_auto_logout_utente`).
- Non scrivere mai PIN o credenziali in questo file.

## 5. Funzionalita' per area

### 5.1 Segnalazioni (guasti)
- Campi: camera/zona, **urgenza** (alta / media / bassa), **categoria**, note, foto "prima", stato camera (fermata libera, fermata con cliente, libera, in arrivo).
- Categorie: idraulico, elettrico, climatizzazione, arredo, edilizio, giardinaggio, pulizia filtri, idromassaggio, extra piani, varie.
- Flusso stati: `todo` -> `waiting` (attesa pezzo) -> `done`. In mezzo e' possibile coinvolgere un **tecnico esterno** (vedi 5.4).
- Attesa pezzo: nome del pezzo, decisione (chi autorizza), chi e da quando e' in attesa; a fine lavoro "pezzo sostituito" e foto "dopo", nota di completamento.
- Elenco con filtri (Da fare / Tecnico / Attesa pezzo / Fatte), swipe tra filtri, ordinamento per urgenza e data, esportazione **CSV**, "Aggiorna report".
- **Coda offline**: se il salvataggio fallisce (rete assente o errore server) la segnalazione resta in `localStorage`, visibile con badge "in attesa", e viene ritentata ogni 30 s e al ritorno online.
- Le segnalazioni possono arrivare anche da **WhatsApp** (vedi 6.1): il sistema riconosce camera e categoria dal testo.

### 5.2 Interventi pianificati
- Creati solo da direzione/gestione: camera/e, categoria, note, data programmata (anche intervallo e piani), **assegnatari multipli** (manutentori interni e tecnici esterni).
- Stati: `pending` -> `done`; gestione pezzo, foto "dopo", avanzamento per camera (`camere_fatte`).
- Pagina **"I miei lavori"** per ogni utente: segnalazioni e interventi assegnati a lui.

### 5.3 Richieste urgenti
- Scheda dedicata per gestione e manutentori. Chi manda: direzione, direttore_congressi, reception, sviluppatore. Chi riceve: manutentori.
- Una richiesta ha `nota`, `creato_da`, stato `aperta` -> `presa_in_carico` -> `completata`. Puo' essere **trasformata in segnalazione**.
- **App aperta**: sirena continua (Web Audio, sbloccata al primo tocco) alla creazione per i manutentori.
- **App chiusa**: notifica push persistente con vibrazione (service worker).
- **WhatsApp** (vedi 6.2): messaggio alla creazione + 3 promemoria a +1, +2, +3 minuti dalla creazione se ancora non presa in carico.
- Le richieste vecchie vengono ripulite dopo 72 h (cron).

### 5.4 Tecnici esterni (rubrica e chiamata)
- Rubrica `tecnici` (nome, telefono) con link WhatsApp precompilato.
- Dalla segnalazione si invia al tecnico un messaggio WhatsApp via template (con eventuale foto): si traccia SID, stato di consegna, risposta del tecnico, orario d'arrivo comunicato, completamento.
- Sollecito automatico dopo 15 minuti se il tecnico non risponde (cron).

### 5.5 Planning Sale (Centro Congressi)
- Prenotazioni per sala e **turno** (mattina / pomeriggio / tutto il giorno) con cliente e note. Sale: Guitar, Drums, Room, Preservation, Cool, Trumpet 1-4, Sax 1-3, Auditorium, Cantina, Gusto, Cravatte, Sala delle Feste e relative **combinazioni** (es. Trumpet 1+2, Sax 1+2+3).
- Controllo conflitti: una sala non puo' essere prenotata se occupata, anche tramite combinazioni; prenotazione su piu' giorni con turno per giorno.

### 5.6 Planning Lavori
- Lavori ricorrenti o a piu' giorni (`planning_lavori` + `planning_lavori_giorni`) con stato per giorno, spunta "fatto", chi e quando, note. I manutentori segnano i lavori fatti.

### 5.7 Tabellone pulizie camere (housekeeping)
- Vista per struttura (Wine / Jazz) e piano. Per ogni camera: stato Slope (arrivo, partenza, partenza+arrivo, fermata, libera), tipologia, letti, note, stato lavoro (da fare / in corso / fatta) con chi e quando.
- Reception e portiere notturno caricano ogni giorno il **file Slope** (xlsx); i dati sono anonimizzati. Reception e governante possono modificare manualmente una camera.
- **Offline-first**: ogni tocco si salva subito in IndexedDB e in una coda che si svuota verso Supabase al ritorno della rete; in conflitto vince il timestamp piu' recente.
- Ogni sera (cron) viene azzerato lo stato delle camere pulite.

### 5.8 Sensori temperatura
- Pagina "Sensori Temperatura" nel menu: nome, temperatura, umidita', online/offline, ultimo aggiornamento, stato di allerta.
- 9 sensori monitorati (camere frigo e ambienti dei due edifici). Soglia di allerta di default 20 C, con soglia dedicata per la cella frigo (0 C), definite in `SOGLIE_SENSORI` (App.jsx) e nella Edge Function.
- Colori: grigio = offline o dato vecchio (>1 h, con banner "Dati non aggiornati"), rosso = in allerta, verde = ok.
- Aggiornamento ogni 30 minuti (cron). Realtime sulla tabella.
- Da fare: avviso quando un sensore va offline; spostare le credenziali eWeLink nei secrets Supabase.

### 5.9 Centro WhatsApp e Pannello Consumi
- **Centro WhatsApp** (gestione): coda dei messaggi in ingresso (`whatsapp_inbox`), segnalazioni in attesa di invio e relativi tentativi, stato dei template.
- **Pannello Consumi** (solo sviluppatore): utilizzo di Twilio, Supabase e Vercel rispetto ai limiti.

### 5.10 Altro
- **Notifiche**: attivazione push e scelta suono (Classico, Jazz, Melodia, Miao, Nessuno), salvata sul dispositivo.
- **Manuale** PDF integrato, **Feedback** (form), **Backup/ripristino JSON**, cambio PIN.
- **Presenza "in struttura"** (vedi 7).

## 6. Messaggistica

### 6.1 WhatsApp in ingresso
Edge Function `whatsapp-webhook`: riceve i messaggi (Twilio), riconosce camera e categoria usando lo stesso elenco di `src/zoneData.js` (**le due copie vanno tenute allineate**), salva in `whatsapp_inbox` e crea la segnalazione; se il salvataggio fallisce finisce in `whatsapp_segnalazioni_pending` e viene ritentato ogni 5 minuti (`retry-whatsapp-pending`).

### 6.2 WhatsApp urgenze
- Tabella `richieste_urgenti`. Il trigger `invia_whatsapp_urgenza_evento()` (su INSERT e cambi di stato) chiama la Edge Function `send-urgenza-whatsapp`, che usa un template Twilio approvato (variabili: mittente e nota).
- **Destinatari**: solo manutentori con `in_struttura = true` e un telefono salvato **in formato internazionale (+39...)**. Senza prefisso Twilio risponde errore 63024 (destinatario non valido).
- **Solleciti**: messaggio alla creazione, poi promemoria "PROMEMORIA n/3" a +1, +2, +3 minuti dalla creazione, solo finche' la richiesta e' `aperta` e non presa in carico. Cron pg_cron ogni 15 secondi, funzione `invia_solleciti_urgenze()`, contatore `whatsapp_solleciti`.
- `whatsapp_inviato = true` significa "accettato da Twilio", non "consegnato". Stato reale: `send-urgenza-whatsapp?checkSid=<SID messaggio>` (sola lettura).

### 6.3 Push
Edge Functions `push-subscribe` (registrazione, tabella `push_subscriptions`) e `send-push`. Notifica alle nuove segnalazioni e urgenze; sulle urgenze e' persistente.

## 7. Presenza "in struttura"
- Colonne su `utenti`: `in_struttura`, `in_struttura_dal`, `in_struttura_via` (`manuale` | `gps` | `auto_7h20` | `auto_gps_7h20`).
- Determina chi riceve i WhatsApp delle urgenze.
- **Manuale**: attivata dall'utente; si spegne da sola dopo 7 h 20 (timer client + job pg_cron per utente).
- **GPS**: aggiornata solo con app aperta; non sovrascrive una presenza "manuale"; ogni ping aggiorna `in_struttura_dal`. Il cron `spegni-presenza-gps-scaduta` (ogni 15 min) la spegne dopo 7 h 20 senza aggiornamenti.

## 8. Realtime e aggiornamento dati
- Canale `apice-changes` su segnalazioni, interventi, tecnici, richieste_urgenti; canali dedicati per sensori, camere, prenotazioni sale, planning lavori.
- Il websocket muore con l'app in background, quindi: il canale viene **ricreato** su `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED`, al ritorno in primo piano, su focus e su evento online; in piu' c'e' un **polling di riserva ogni 20 s** a scheda visibile (segnalazioni + urgenze). Al ritorno in primo piano si ricarica una sola volta (anti-doppione 3 s) e il canale si riapre solo se l'app era in background da piu' di 30 s.
- Tabelle in publication realtime: camere_giorno, camere_lavoro, camere_pulite_oggi, interventi, planning_lavori, planning_lavori_giorni, richieste_urgenti, segnalazioni, sensori_temperatura, tecnici.

## 8bis. Prestazioni e caricamento
- Le **foto delle segnalazioni sono in base64 nella tabella** `segnalazioni` (~16 MB in totale): `DB.loadItems()` NON le scarica (seleziona solo le colonne leggere, ~100 KB). Le foto si caricano a parte con `DB.loadFoto(ids)` a blocchi di 6 e restano in cache in memoria per la sessione: prima in background quelle di segnalazioni aperte o degli ultimi 14 giorni, le altre all'apertura del dettaglio/modifica.
- **Regola importante:** una segnalazione senza foto caricata ha `photoBefore/photoAfter === undefined`; `itemToRow` in quel caso **omette** `foto_prima/foto_dopo` dall'upsert, cosi' il salvataggio non cancella mai le foto presenti sul database. Mai sostituire `undefined` con `null` nei form di modifica.
- `xlsx` (file Slope) e `pdf.js` (manuale) si caricano solo quando servono (import dinamico / script iniettato), non all'avvio.
- Il service worker non mette in cache offline le risposte con foto (`foto_` nella query) e usa cache versionata (`VERSION` in `public/sw.js`: incrementarla quando si cambia la strategia di cache).
- **Rendering**: la lista segnalazioni disegna al massimo 40 schede per volta (pulsante "Mostra altre"); le miniature usano `loading="lazy"` e `decoding="async"`. `refresh()` aggiorna lo stato solo se i dati sono cambiati (`sameList`), cosi' il polling non fa ri-renderizzare l'intera app.
- Idea futura: spostare le foto su Supabase Storage (URL al posto del base64) e comprimerle in upload; ridurrebbe ancora peso e tempi.

## 9. Database (schema pubblico)

| Tabella | Contenuto |
|---|---|
| `utenti` | nome, ruolo, PIN, zone consentite, obbligo cambio PIN, telefono, presenza in struttura |
| `tecnici` | rubrica tecnici esterni (nome, telefono) |
| `segnalazioni` | guasti: camera, urgenza, categoria, stato, foto, pezzo, tecnico esterno (chiamata, SID, stato, risposta, arrivo), completamento |
| `interventi` | interventi pianificati con assegnatari, date, camere/piani, pezzo, foto dopo |
| `richieste_urgenti` | allarmi urgenti, presa in carico, completamento, WhatsApp inviato e solleciti, collegamento alla segnalazione |
| `sensori_temperatura` | ultime letture dei sensori e stato di allerta |
| `ewelink_tokens`, `ewelink_sensori` | supporto integrazione eWeLink (token OAuth) |
| `planning_lavori`, `planning_lavori_giorni` | planning lavori e stato per giorno |
| `prenotazioni_sale` | prenotazioni sale per turno |
| `camere_giorno`, `camere_lavoro`, `camere_pulite_oggi`, `import_camere` | tabellone pulizie e storico caricamenti Slope |
| `whatsapp_inbox`, `whatsapp_segnalazioni_pending`, `whatsapp_template_status` | messaggi in ingresso, coda di retry, stato template |
| `push_subscriptions` | iscrizioni Web Push per utente/ruolo |
| `app_config` | configurazione chiave/valore (URL interni, ID template, PIN admin) — non esporre mai i valori |
| `telegram_history_*` | archivio storico importato da Telegram (ticket, foto di backup, stato backfill) |

RLS attivo ovunque con policy permissive.

## 10. Edge Functions

| Funzione | Ruolo |
|---|---|
| `whatsapp-webhook` | Riceve WhatsApp, crea segnalazioni |
| `retry-whatsapp-pending` | Riprova le segnalazioni WhatsApp non salvate |
| `send-urgenza-whatsapp` | Invia l'urgenza (e i promemoria) ai manutentori in struttura; `?checkSid=` verifica la consegna |
| `send-tecnico-whatsapp`, `notify-tecnico`, `check-tecnico-templates` | Chiamata e sollecito del tecnico esterno, verifica template |
| `setup-whatsapp-template` | Creazione/invio in approvazione dei template WhatsApp |
| `check-twilio-usage` | Consumi Twilio per il Pannello Consumi |
| `send-push`, `push-subscribe` | Web Push |
| `sync-sensori-temperatura` | Lettura sensori eWeLink con paginazione (API: max 30 dispositivi/pagina) e salvataggio |
| `ewelink-login`, `ewelink-login-url`, `ewelink-oauth-callback` | Collegamento account eWeLink (OAuth) |
| `upload-storage-file` | Caricamento file/foto su Storage |
| `telegram-history-backfill` / `-diag` / `-restore` / `-runner` | Importazione e ripristino dell'archivio storico Telegram |
| `debug-ewelink-devices` | Disattivata (risponde 410) |

## 11. Job pianificati (pg_cron)

| Job | Frequenza | Funzione |
|---|---|---|
| `sincronizza-sensori-temperatura` | ogni 30 min | aggiorna i sensori |
| `solleciti-whatsapp-urgenze` | ogni 15 s | promemoria WhatsApp urgenze |
| `spegni-presenza-gps-scaduta` | ogni 15 min | spegne presenza GPS scaduta |
| `sollecito-tecnico-15min` | ogni minuto | sollecita i tecnici esterni senza risposta |
| `retry-whatsapp-pending-5min` | ogni 5 min | ritenta segnalazioni WhatsApp in coda |
| `controlla-approvazione-whatsapp` | ogni 6 h | stato approvazione template |
| `pulisci-richieste-urgenti-72h` | ogni ora | elimina urgenze vecchie |
| `azzera-camere-pulite` | ogni sera | azzera lo stato "pulita" |
| `auto-logout-user-*` | una tantum, per utente | logout programmato |
| `controlla-whatsapp-urgenze` | disattivato | sostituito dal trigger |

## 12. Sviluppo e deploy

```bash
npm install     # richiede accesso a cdn.sheetjs.com per la dipendenza xlsx
npm run dev     # sviluppo locale
npm run build   # build di produzione (output dist/)
```

Flusso: modifica -> branch -> commit -> PR -> merge su `main` -> Vercel ricostruisce (circa 1 minuto) e pubblica su https://hotelgio.vercel.app.

**Attenzione al deploy**: il 09/10/2026 si e' scoperto che Vercel non ricostruiva dal 09/09 nonostante i merge su `main`. Dopo ogni merge verificare in Vercel > Deployments che compaia un deploy "Ready"; altrimenti ridistribuire a mano il commit di `main` e controllare Settings > Git. Dopo un deploy, chiudere e riaprire l'app per caricare la nuova versione (il service worker serve la copia in cache; versione cache in `public/sw.js`).

## 13. Note operative
- Dati condivisi (segnalazioni, utenti, tecnici, interventi, urgenze, planning, sensori) vivono su Supabase; in `localStorage` restano solo sessione di login, preferenze (suono notifiche) e coda offline.
- I numeri di telefono vanno sempre salvati con prefisso internazionale (+39...).
- Elenco camere/zone duplicato in `src/zoneData.js` e nella Edge Function `whatsapp-webhook`: aggiornare entrambi.
- Backup: automatici giornalieri (Supabase Pro) e backup/ripristino JSON dall'app.
