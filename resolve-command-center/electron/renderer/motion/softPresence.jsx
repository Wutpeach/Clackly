import { section as MotionSection } from "motion/react-m";
import { useReducedMotion } from "motion/react";

const softPresenceTransition = Object.freeze({
  duration: 0.12,
  ease: Object.freeze([0.16, 1, 0.3, 1])
});

/**
 * The sole approved Renderer presence treatment. MotionConfig removes its
 * spatial transform for users who prefer reduced motion while retaining a
 * short opacity state cue.
 */
export const softPresence = Object.freeze({
  initial: Object.freeze({ opacity: 0, y: 3 }),
  animate: Object.freeze({ opacity: 1, y: 0 }),
  transition: softPresenceTransition
});

export default function SoftPresence({ children, className, ariaLabel }) {
  const reducedMotion = useReducedMotion();
  return (
    <MotionSection
      className={className}
      aria-label={ariaLabel}
      data-motion-preset="softPresence"
      initial={reducedMotion ? { opacity: softPresence.initial.opacity } : softPresence.initial}
      animate={reducedMotion ? { opacity: softPresence.animate.opacity } : softPresence.animate}
      transition={softPresence.transition}
    >
      {children}
    </MotionSection>
  );
}
