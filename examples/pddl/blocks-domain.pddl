; Blocksworld classico con una mano singola.
; Usa (not (= ?x ?y)) per evitare di impilare un blocco su se stesso: mostra
; il grounding con :equality come filtro di binding.
(define (domain blocks)
  (:requirements :strips :typing :equality)
  (:types block)
  (:predicates
    (on ?x - block ?y - block)
    (ontable ?x - block)
    (clear ?x - block)
    (handempty)
    (holding ?x - block))

  (:action pickup
    :parameters (?x - block)
    :precondition (and (clear ?x) (ontable ?x) (handempty))
    :effect (and (holding ?x)
                 (not (ontable ?x)) (not (clear ?x)) (not (handempty))))

  (:action putdown
    :parameters (?x - block)
    :precondition (and (holding ?x))
    :effect (and (ontable ?x) (clear ?x) (handempty)
                 (not (holding ?x))))

  (:action stack
    :parameters (?x - block ?y - block)
    :precondition (and (holding ?x) (clear ?y) (not (= ?x ?y)))
    :effect (and (on ?x ?y) (clear ?x) (handempty)
                 (not (holding ?x)) (not (clear ?y))))

  (:action unstack
    :parameters (?x - block ?y - block)
    :precondition (and (on ?x ?y) (clear ?x) (handempty) (not (= ?x ?y)))
    :effect (and (holding ?x) (clear ?y)
                 (not (on ?x ?y)) (not (clear ?x)) (not (handempty)))))
