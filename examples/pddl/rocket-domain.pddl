; Rocket / logistics-lite: un razzo trasporta carichi tra due siti, ma può
; volare una sola volta (consuma il carburante). Mostra un mutex temporale
; interessante: caricare tutto PRIMA di volare.
(define (domain rocket)
  (:requirements :strips :typing)
  (:types rocket place cargo)
  (:predicates
    (at ?x - cargo ?p - place)
    (rocket-at ?r - rocket ?p - place)
    (in ?x - cargo ?r - rocket)
    (has-fuel ?r - rocket))

  (:action load
    :parameters (?x - cargo ?r - rocket ?p - place)
    :precondition (and (at ?x ?p) (rocket-at ?r ?p))
    :effect (and (in ?x ?r) (not (at ?x ?p))))

  (:action unload
    :parameters (?x - cargo ?r - rocket ?p - place)
    :precondition (and (in ?x ?r) (rocket-at ?r ?p))
    :effect (and (at ?x ?p) (not (in ?x ?r))))

  (:action fly
    :parameters (?r - rocket ?from - place ?to - place)
    :precondition (and (rocket-at ?r ?from) (has-fuel ?r))
    :effect (and (rocket-at ?r ?to)
                 (not (rocket-at ?r ?from)) (not (has-fuel ?r)))))
