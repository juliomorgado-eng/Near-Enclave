// Text printed on the keycard (UI chrome only — page copy lives in src/content/copy.ts).
export const CARD = {
  kind: 'INVITATION',
  when: 'APRIL 2027 · NEW YORK',
  no: 'Nº 0427·1193',
  backTitle: 'ENCLAVE/27 · CREDENTIAL',
  // Back side rows, revealed one by one as the Shift is read.
  rows: [
    { k: 'NETWORK', v: 'OPEN · ANYONE CAN REACH', redact: false },
    { k: 'ASSETS', v: 'PERMISSIONED RAILS', redact: false },
    { k: 'HOLDER', v: '', redact: true },
    { k: 'ACCESS', v: 'ADMIT ONE · NYC', redact: false },
  ],
  proof: 'PRIVACY: ON · VERIFIED',
};
