// Moving a pet to another device: the whole save, compressed into a link
// (#move=...) that a QR code or a pasted link carries. The receiving side
// checks it like a backup before using it.

const MOVE_COMPRESSED = "z", MOVE_PLAIN = "j";   // first character: how the rest is packed

function toBase64Url(bytes) {
  let bin = "";
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const fromBase64Url = text => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

// state -> link-safe text. Compressed where the browser can, plain otherwise.
export async function encodeMove(state) {
  const bytes = new TextEncoder().encode(JSON.stringify({ app: "study-pet", data: state }));
  if (typeof CompressionStream === "undefined") return MOVE_PLAIN + toBase64Url(bytes);
  return MOVE_COMPRESSED + toBase64Url(await pipe(bytes, new CompressionStream("deflate-raw")));
}

// Link text -> backup text, ready for importBackup(). Throws on a damaged link.
export async function decodeMove(code) {
  try {
    const kind = code[0], bytes = fromBase64Url(code.slice(1));
    if (kind === MOVE_PLAIN) return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (kind === MOVE_COMPRESSED) return new TextDecoder("utf-8", { fatal: true }).decode(await pipe(bytes, new DecompressionStream("deflate-raw")));
  } catch (e) { /* fall through */ }
  throw new Error("This move link looks incomplete. Make a new one on the other device and try again.");
}
