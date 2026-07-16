// Shared implementations for the site-scoped Netlify functions that must be identical
// across apps/web and apps/admin. Each app's netlify/functions/<name>.ts is a thin
// re-export of the matching handler here — ONE source of truth, so a fix can't land on
// one site and not the other (the drift the parity check used to only detect after the fact).
export { handler as macroEventsHandler } from './macro-events';
export { handler as fredHandler } from './fred';
export { handler as macroRecapHandler } from './macro-recap';
