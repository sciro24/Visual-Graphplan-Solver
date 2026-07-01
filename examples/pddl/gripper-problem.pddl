; Robot in rooma con una pallina; portala in roomb.
; Piano atteso: pick(ball1, rooma) -> move(rooma, roomb) -> drop(ball1, roomb).
(define (problem gripper-1)
  (:domain gripper)
  (:objects
    rooma roomb - room
    ball1 - ball)
  (:init
    (at-robot rooma)
    (at ball1 rooma)
    (free))
  (:goal (and (at ball1 roomb))))
