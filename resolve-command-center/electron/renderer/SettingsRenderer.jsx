import React from "react";
import { getSettingsControl } from "./model.mjs";

function SettingsRenderer({ schema, values, onChange, onPick, t, disabled = false, runtime = false }) {
  const fields = Object.entries(schema);
  if (fields.length === 0) {
    return <p className="settings-empty-copy">{t("settings.noSettings")}</p>;
  }

  async function pickValue(key, type) {
    const picked = await onPick(type, key);
    if (picked !== null) onChange(key, picked);
  }

  return (
    <div className="settings-fields">
      {fields.map(([key, field]) => {
        const control = getSettingsControl(field.type === 'text' ? { ...field, type: 'string' } : field);
        const inputId = `setting-${key}`;
        const value = values[key];

        if (control.kind === "checkbox") {
          return (
            <div className="settings-field switch-field" key={key}>
              <label htmlFor={inputId}>{field.label}{field.required ? " *" : ""}
                {field.description && <span className="command-field-description" id={`${inputId}-help`}>{field.description}</span>}
              </label>
              <input
                id={inputId}
                type="checkbox"
                role="switch"
                checked={Boolean(value)}
                required={runtime ? false : field.required}
                aria-describedby={field.description ? `${inputId}-help` : undefined}
                disabled={disabled}
                onChange={(event) => onChange(key, event.target.checked)}
              />
            </div>
          );
        }

        return (
          <div className="settings-field" key={key}>
            <label htmlFor={inputId}>{field.label}{field.required ? " *" : ""}</label>
            {field.description && <p className="command-field-description" id={`${inputId}-help`}>{field.description}</p>}
            {field.type === 'text' ? (
              <textarea id={inputId} value={value ?? ''} placeholder={field.placeholder} required={field.required}
                aria-describedby={field.description ? `${inputId}-help` : undefined} maxLength={8192} disabled={disabled}
                onChange={(event) => onChange(key, event.target.value)} />
            ) : control.kind === "select" ? (
              <select
                id={inputId}
                value={value ?? ""}
                required={field.required}
                disabled={disabled}
                aria-describedby={field.description ? `${inputId}-help` : undefined}
                onChange={(event) => onChange(key, event.target.value || undefined)}
              >
                <option value="" disabled={Boolean(field.required)}>{t("settings.selectOption")}</option>
                {control.options.map((option, index) => (
                  <option key={`${option}-${index}`} value={option}>{field.optionLabels?.[option] || option}</option>
                ))}
              </select>
            ) : control.kind === "picker" ? (
              <div className="settings-picker-control">
                <input
                  id={inputId}
                  type="text"
                  value={value ?? ""}
                  title={value || undefined}
                  required={field.required}
                  disabled={disabled}
                  placeholder={field.placeholder}
                  maxLength={runtime ? 8192 : undefined}
                  aria-describedby={field.description ? `${inputId}-help` : undefined}
                  onChange={(event) => onChange(key, event.target.value)}
                />
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => pickValue(key, control.pickerType)}
                >
                  {t("settings.browse")}
                </button>
              </div>
            ) : (
              <input
                id={inputId}
                type={control.inputType}
                placeholder={field.placeholder}
                min={field.min}
                max={field.max}
                step={runtime && control.inputType === 'number' ? 'any' : undefined}
                maxLength={runtime ? 8192 : undefined}
                aria-describedby={field.description ? `${inputId}-help` : undefined}
                value={value ?? (control.inputType === "color" ? "#101216" : "")}
                required={field.required}
                disabled={disabled}
                onChange={(event) => {
                  if (control.inputType !== "number") {
                    onChange(key, event.target.value);
                    return;
                  }
                  const next = event.target.valueAsNumber;
                  onChange(key, Number.isFinite(next) ? next : undefined);
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default SettingsRenderer;
