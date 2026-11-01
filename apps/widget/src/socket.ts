/**
 * The socket's refusal code. Lives outside `index.ts` because workerd treats
 * every named export of the entry module as a handler and refuses to start on
 * one that is not (`Incorrect type for map entry`); the test pool is more
 * lenient, which is how it got there in the first place.
 *
 * Browsers hide the HTTP status of a failed WebSocket upgrade: a 403 reaches
 * the page as close code 1006, the same as a dropped connection, so the embed
 * could not tell "your token expired" from "the network blipped". Completing
 * the handshake and closing with an application code gives it a signal it can
 * read, carrying exactly what the 403 did: refused, no reason (ADR-016
 * amendment).
 */
export const SOCKET_REFUSED_CODE = 4403;
