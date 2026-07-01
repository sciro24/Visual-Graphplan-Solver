# Esempi PDDL

Coppie dominio/problema in PDDL per provare l'import del Visual Graphplan
Solver. Ogni problema usa il sottoinsieme supportato: `:strips`, `:typing`,
`:negative-preconditions`, `:equality`.

## Come caricarli

1. Apri l'app → **Aggiungi problema** → scheda **PDDL**.
2. Carica il file `*-domain.pddl` col pulsante accanto a **Dominio** e il file
   `*-problem.pddl` col pulsante accanto a **Problema** (oppure incolla il testo).
3. Le azioni vengono istanziate (grounding) sugli oggetti dichiarati, potate per
   tipo. Se valido → **Aggiungi e visualizza**.

## File

| Coppia | Descrizione | Piano atteso |
| --- | --- | --- |
| `gripper-*` | Robot con pinza sposta una pallina tra due stanze. | pick → move → drop |
| `blocks-*` | Blocksworld a 3 blocchi, mano singola; torre a-b-c. | pickup b → stack b c → pickup a → stack a b |
| `rocket-*` | Razzo con un solo volo: carica entrambi i carichi prima di volare. | load c1, load c2 → fly → unload c1, unload c2 |

`blocks` e `rocket` usano `(not (= ?x ?y))` per mostrare l'uguaglianza come
filtro di binding durante il grounding.

## Limiti

Dopo il grounding valgono i limiti del motore (max ~60 azioni, ~40 letterali):
sono pensati per domini didattici piccoli. Istanze troppo grandi vengono
rifiutate con un messaggio chiaro nella sezione **Vincoli e validazione**.
