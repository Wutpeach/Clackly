import React from "react";
import { MouseLeft, MouseRight } from "lucide-react";

const modifierLabels = { CTRL: "Ctrl", SHIFT: "Shift", ALT: "Alt" };

export default function InteractionInput({ label, trigger, className = "interaction-input" }) {
  // Legacy text-only snapshots stay readable; icons never infer semantics from text.
  const tokens = trigger ? trigger.modifiers.map((key) => modifierLabels[key]) : [label];
  const MouseIcon = trigger?.button === "right" ? MouseRight : MouseLeft;
  return (
    <span className={className} aria-label={label} title={label}>
      {tokens.map((token, index) => (
        <React.Fragment key={index}>
          {index > 0 && <span className="interaction-plus" aria-hidden="true">+</span>}
          <kbd aria-hidden="true">{token}</kbd>
        </React.Fragment>
      ))}
      {trigger && <>
        {tokens.length > 0 && <span className="interaction-plus" aria-hidden="true">+</span>}
        <kbd className="interaction-mouse" aria-hidden="true" data-mouse-button={trigger.button}>
          <MouseIcon size={16} strokeWidth={1.75} />
        </kbd>
      </>}
    </span>
  );
}
