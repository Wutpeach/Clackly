import { domAnimation, LazyMotion, MotionConfig } from "motion/react";

/**
 * Renderer-only Motion ownership. Native window visibility, geometry, focus,
 * and detached-panel lifecycle remain outside this React boundary.
 */
export default function MotionBoundary({ children }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
