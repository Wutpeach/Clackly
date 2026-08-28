import React from "react";
import { getSettingsControl } from "./model.mjs";

function SettingsRenderer({ schema, values, onChange, onPick, t, disabled = false }) {
  const fields = Object.entries(schema);
  if (fields.length === 0) {
    return <p className="settings-empty-copy">{t("settings.noSettings")}</p>;
  }

  async function pickValue(key, type) {
    const picked = await onPick(type);
    if (picked !== null) onChange(key, picked);
  }

  return (
    <div className="settings-fields">
      {fields.map(([key, field]) => {
        const control = getSettingsControl(field);
        const inputId = `setting-${key}`;
        const value = values[key];

        if (control.kind === "checkbox") {
          return (
            <div className="settings-field checkbox-field" key={key}>
              <input
                id={inputId}
                type="checkbox"
                checked={Boolean(value)}
                required={field.required}
                disabled={disabled}
                onChange={(event) => onChange(key, event.target.checked)}
              />
                  <label htmlFor={inputId}>{field.label}{field.required ? " *" : ""}</label>
            </div>
          );
        }

        return (
          <div className="settings-field" key={key}>
            <label htmlFor={inputId}>{field.label}{field.required ? " *" : ""}</label>
            {control.kind === "select" ? (
              <select
                id={inputId}
                value={value ?? ""}
                required={field.required}
                disabled={disabled}
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
                  required={field.required}
                  disabled={disabled}
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
