; Tre blocchi a b c tutti sul tavolo; obiettivo: torre a-su-b-su-c.
; Piano atteso: pickup(b) -> stack(b,c) -> pickup(a) -> stack(a,b).
(define (problem blocks-abc)
  (:domain blocks)
  (:objects a b c - block)
  (:init
    (ontable a) (ontable b) (ontable c)
    (clear a) (clear b) (clear c)
    (handempty))
  (:goal (and (on a b) (on b c))))
