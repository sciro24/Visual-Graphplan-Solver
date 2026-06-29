# Scelte algoritmiche — Mini-Graphplan

Documento breve sulle decisioni di progetto del motore Graphplan.

## 1. Modello: STRIPS positivo

Il motore usa STRIPS senza precondizioni negative. Gli stati complementari sono
codificati con letterali distinti più delete effects (`have-cake` vs
`no-cake`). Conseguenza importante: **la mutex per "negazione" non ha bisogno
di un operatore di negazione**. Due letterali complementari risultano mutex
perché le uniche azioni che li producono cancellano l'uno l'effetto dell'altro
→ inconsistent effects sulle azioni → inconsistent support sui letterali. Il
codice mantiene comunque un canale `declaredNegations` (vuoto di default) per
domini futuri che vogliano dichiarare coppie complementari esplicite.

## 2. Due fasi nettamente separate

- **Espansione** (`graphplan.ts`) — costruisce i livelli e le mutex.
- **Estrazione** (`extract.ts`) — regredisce i goal a ritroso.

I due moduli non si chiamano a vicenda durante la costruzione: l'espansione
produce un `PlanningGraph` immutabile, l'estrazione lo legge. Questo rispecchia
la struttura concettuale dell'algoritmo e rende ogni metà testabile in
isolamento.

## 3. No-op come azioni di prima classe

Per ogni letterale presente in `S_k` viene sintetizzata un'azione
`noop:<lit>` con `pre = add = {lit}`, `del = {}`, marcata `isNoOp`. Sono
trattate come azioni reali nel calcolo delle mutex e nell'estrazione (così la
persistenza dei letterali partecipa correttamente a interference e competing
needs), ma sono distinguibili nel dato e nella UI.

## 4. Mutex

**Azioni** (`computeActionMutexes`), nell'ordine di test:

1. *Inconsistent effects* — una aggiunge ciò che l'altra cancella.
2. *Interference* — una cancella una precondizione dell'altra.
3. *Competing needs* — due precondizioni sono mutex nel livello stato
   precedente.

**Proposizioni** (`computePropMutexes`):

- *Negazione* — coppie dichiarate complementari (di default nessuna; vedi §1).
- *Inconsistent support* — **ogni** coppia di azioni che produce i due
  letterali è mutex.

Ogni mutex è memorizzata con `reason` e `explanation` testuale **precalcolata**:
la UI non ricalcola mai il motivo a runtime, lo legge dal dato. È un invariante
del modello richiesto dalle specifiche.

## 5. Applicabilità delle azioni

Un'azione entra in `A_k` se tutte le precondizioni sono in `S_k` **e** non sono
a coppie mutex tra loro in `S_k` (`precondsAreMutex`). Questo evita di
introdurre azioni che dipendono da una combinazione di letterali già
dimostrata irraggiungibile insieme.

## 6. Goal test e level-off

`goalsReachable(goals, S_k)` = tutti i goal presenti e nessuna coppia goal
mutex. L'espansione procede finché il goal test passa (stop anticipato) oppure
finché il grafo si **livella**: stesso insieme di letterali **e** stesso
insieme di mutex tra `S_k` e `S_{k+1}` (`sameLiteralSet` + `sameMutexSet`). Se
livellato e goal non raggiungibili → problema irrisolvibile.

## 7. Estrazione backward con backtracking

Partendo dal primo `S_k` che supera il goal test:

1. Per ogni goal si raccolgono i supporter in `A_{k-1}`.
2. Ricerca DFS: si sceglie un supporter per goal scartando ogni scelta che sia
   mutex con un'azione già scelta; un'azione può coprire più goal.
3. I subgoal del livello inferiore sono l'unione delle precondizioni delle
   azioni scelte.
4. Ricorsione fino a `S0` (caso base: tutti i goal già nello stato iniziale).
5. Su fallimento di un ramo si fa **backtracking** su scelte alternative
   (`ctx.steps.pop()`).

Ogni passo è salvato come `ExtractionStep` (goalSet, chosenActions,
inducedSubgoals) per replay/animazione e per il pannello di spiegazione. Il
piano finale è esposto come layer ordinati `S0 → goal`, no-op escluse.

> Nota didattica: questa implementazione non include il memoization dei
> "no-good" tra livelli né l'iterazione *expand-then-extract* del Graphplan
> completo (che ri-espande e ritenta a livelli superiori). Sui domini demo
> piccoli il primo livello che passa il goal test è sufficiente; per il caso
> Cake il motore mostra correttamente il fallimento a `S1` e il successo a `S2`.

## 8. Layout deterministico

La vista (`view/serialize.ts`) dispone i nodi per **livello = colonna**,
**riga = indice ordinato** (azioni reali prima, no-op dopo, alfabetico). Niente
force-directed: lo stesso grafo appare sempre uguale, requisito per leggibilità
e debugging. Archi causali e archi mutex sono prodotti come liste separate con
`kind` esplicito.
