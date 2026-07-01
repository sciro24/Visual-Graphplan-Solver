; Gripper — un robot con una pinza sposta palline tra stanze.
; Dominio STRIPS tipizzato: le azioni vengono istanziate (grounding) sugli
; oggetti dichiarati nel problema, potate per tipo.
(define (domain gripper)
  (:requirements :strips :typing :equality)
  (:types room ball)
  (:predicates
    (at-robot ?r - room)
    (at ?b - ball ?r - room)
    (free)
    (carry ?b - ball))

  (:action move
    :parameters (?from - room ?to - room)
    :precondition (and (at-robot ?from) (not (= ?from ?to)))
    :effect (and (at-robot ?to) (not (at-robot ?from))))

  (:action pick
    :parameters (?b - ball ?r - room)
    :precondition (and (at ?b ?r) (at-robot ?r) (free))
    :effect (and (carry ?b) (not (at ?b ?r)) (not (free))))

  (:action drop
    :parameters (?b - ball ?r - room)
    :precondition (and (carry ?b) (at-robot ?r))
    :effect (and (at ?b ?r) (free) (not (carry ?b)))))
