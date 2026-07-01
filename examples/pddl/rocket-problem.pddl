; Due carichi a londra, il razzo pieno di carburante; portali entrambi a parigi.
; Il razzo vola una volta sola: bisogna caricare ENTRAMBI prima di volare.
; Piano atteso: load(c1) , load(c2) -> fly(londra, parigi) -> unload(c1), unload(c2).
(define (problem rocket-2cargo)
  (:domain rocket)
  (:objects
    apollo - rocket
    londra parigi - place
    c1 c2 - cargo)
  (:init
    (rocket-at apollo londra)
    (has-fuel apollo)
    (at c1 londra)
    (at c2 londra))
  (:goal (and (at c1 parigi) (at c2 parigi))))
