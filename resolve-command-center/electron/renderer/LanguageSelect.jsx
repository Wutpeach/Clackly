import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

// This select owns presentation only; Preferences remains the value authority.
export default function LanguageSelect({ id, labelId, value, options, disabled, onChange }) {
  const control = useRef(null);
  const popup = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState(null);
  const selected = Math.max(0, options.findIndex((option) => option.value === value));
  const listId = `${id}-options`;

  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) control.current?.focus();
  }

  function choose(index) {
    if (disabled) return;
    close(true);
    if (options[index].value !== value) onChange(options[index].value);
  }

  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = control.current.getBoundingClientRect();
      const height = popup.current?.offsetHeight || options.length * 30 + 8;
      const width = Math.min(Math.max(rect.width, 180), window.innerWidth - 16);
      const below = rect.bottom + 4;
      setPosition({
        width,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: Math.max(8, below + height <= window.innerHeight - 8 ? below : rect.top - height - 4)
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => {
      if (!control.current?.contains(event.target) && !popup.current?.contains(event.target)) close();
    };
    const blur = () => close();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("blur", blur);
    };
  }, [open]);

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  function onKeyDown(event) {
    if (disabled) return;
    if (event.key === "Tab") { close(); return; }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      setActive((current) => event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
        : !open ? selected : (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
      setOpen(true);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(active);
      else { setActive(selected); setOpen(true); }
    }
  }

  return (
    <>
      <button ref={control} id={id} type="button" role="combobox" className="language-select"
        aria-labelledby={labelId} aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-haspopup="listbox" aria-disabled={disabled}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onKeyDown={onKeyDown} onBlur={() => close()}
        onClick={() => { if (!disabled) { setActive(selected); setOpen(!open); } }}>
        <span>{options[selected].label}</span><ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && createPortal(
        <div ref={popup} id={listId} role="listbox" aria-labelledby={labelId}
          className="language-options" style={{ ...position, visibility: position ? "visible" : "hidden" }}>
          {options.map((option, index) => (
            <div id={`${listId}-${index}`} key={option.value} role="option" aria-selected={index === selected}
              className={index === active ? "language-option active" : "language-option"}
              onPointerDown={(event) => event.preventDefault()} onPointerMove={() => setActive(index)}
              onClick={() => choose(index)}>
              <span>{option.label}</span>{index === selected && <Check size={14} aria-hidden="true" />}
            </div>
          ))}
        </div>, document.body
      )}
    </>
  );
}
