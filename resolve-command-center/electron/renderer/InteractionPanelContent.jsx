import React from "react";
import InteractionInput from "./InteractionInput.jsx";

function InteractionRow({ interaction }) {
  return (
    <div className="interaction-row" role="listitem" aria-label={interaction.ariaLabel}>
      <InteractionInput label={interaction.label} trigger={interaction.trigger} />
      <span className="interaction-action-name">{interaction.actionName}</span>
    </div>
  );
}

export default function InteractionPanelContent({ presentation, previewNote = null }) {
  if (!presentation) return null;
  return (
    <>
      {presentation.kind === "mappings" ? (
        <div className="interaction-list" role="list">
          {presentation.rows.map((interaction, index) => (
            <InteractionRow key={`${interaction.label}-${interaction.actionName}-${index}`} interaction={interaction} />
          ))}
        </div>
      ) : (
        <p className="interaction-description">{presentation.description}</p>
      )}
      {previewNote && (
        <p className="interaction-preview-note">{previewNote}</p>
      )}
    </>
  );
}
