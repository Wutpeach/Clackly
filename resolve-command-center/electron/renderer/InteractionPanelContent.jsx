import React from "react";

function InteractionRow({ interaction }) {
  const inputTokens = interaction.label.split(" + ").filter(Boolean);
  return (
    <div className="interaction-row" role="listitem" aria-label={`${interaction.label}: ${interaction.actionName}`}>
      <span className="interaction-input" aria-hidden="true">
        {inputTokens.map((token, index) => (
          <React.Fragment key={`${token}-${index}`}>
            {index > 0 && <span className="interaction-plus">+</span>}
            <kbd>{token}</kbd>
          </React.Fragment>
        ))}
      </span>
      <span className="interaction-action-name">{interaction.actionName}</span>
    </div>
  );
}

export default function InteractionPanelContent({ presentation }) {
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
    </>
  );
}
