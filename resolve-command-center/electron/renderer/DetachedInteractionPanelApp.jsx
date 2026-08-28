import { useEffect, useState } from "react";
import InteractionPanelContent from "./InteractionPanelContent.jsx";

export default function DetachedInteractionPanelApp() {
  const [presentation, setPresentation] = useState(null);

  useEffect(() => {
    const panelApi = window.resolveCommandCenterPanel;
    if (!panelApi) return undefined;
    return panelApi.onPresentation(setPresentation);
  }, []);

  return (
    <main className="detached-interaction-panel" aria-label="Command information">
      <InteractionPanelContent presentation={presentation} />
    </main>
  );
}
