import { createBrowserPreviewApi } from "./browserPreview.mjs";

export const api = window.resolveCommandCenter || createBrowserPreviewApi();
