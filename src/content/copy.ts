// Single source of truth for NEAR Enclave 2027 copy. Both v1 and v2 render from here.
// Do not edit strings inside components — edit them here.

export const meta = {
  url: 'https://enclave.near.org',
  title: 'NEAR Enclave 2027: Open Markets, Private Money | NYC',
  description:
    'A one-day, invitation-only New York City summit for institutions moving onchain. April 2027.',
};

export const hero = {
  h1: 'NEAR Enclave 2027: Open Markets, Private Money',
  // Split helpers for display layouts (must join back to h1).
  h1Lead: 'NEAR Enclave 2027:',
  h1Lines: ['Open Markets,', 'Private Money'],
  eyebrow: 'April 2027 · New York City · Hosted by NEAR',
  eyebrowParts: ['April 2027', 'New York City', 'Hosted by NEAR'],
  subhead:
    'One day in New York for the institutions moving global markets onchain, and for the question that decides how far they go: how to keep money confidential on open networks.',
  cta: 'Request an invitation',
};

export const shift = {
  h2: "Markets are moving onchain, but institutions can't trade in public.",
  body: [
    'Payments, collateral, and settlement are converging on open networks that anyone can build on and anyone can reach.',
    'The capital is following, but most institutional assets still sit on permissioned rails.',
    'Privacy is the missing primitive.',
    'NEAR Enclave convenes the institutions building and buying it.',
  ],
};

export type Stat = {
  value: string;
  // Numeric parts for count-up animations. Render prefix + number + suffix.
  prefix: string;
  number: number;
  numberTo?: number; // for ranges like 3–5
  decimals: number;
  suffix: string;
  label: string;
  source: string;
};

export const stats: Stat[] = [
  {
    value: '$300B+',
    prefix: '$',
    number: 300,
    decimals: 0,
    suffix: 'B+',
    label: 'Stablecoins in circulation',
    source: 'DefiLlama, October 2026',
  },
  {
    value: '$1.9T',
    prefix: '$',
    number: 1.9,
    decimals: 1,
    suffix: 'T',
    label: 'Projected stablecoin supply by 2030, base case',
    source: 'Citi',
  },
  {
    value: '$38.6B',
    prefix: '$',
    number: 38.6,
    decimals: 1,
    suffix: 'B',
    label: 'Tokenized real-world assets on public blockchains, nearly double the start of 2026',
    source: 'rwa.xyz, September 2026',
  },
  {
    value: '$3–5T',
    prefix: '$',
    number: 3,
    numberTo: 5,
    decimals: 0,
    suffix: 'T',
    label: 'Projected global commerce orchestrated by AI agents by 2030',
    source: 'McKinsey',
  },
];

export const format = {
  h2: 'One stage in the capital of capital.',
  body: [
    'NEAR Enclave runs on a single stage in New York, a few miles from the exchanges, banks, asset managers, and regulators that set the terms for global capital.',
    'Every session is a long-form conversation or debate pitched at the 301 and 401 level.',
    'The program opens with a speaker dinner the night before, and select sessions are recorded on site with our media partners.',
    'Attendance is by invitation, and every request is reviewed to keep the room balanced across institutions, investors, builders, and press.',
  ],
};

export const agenda = {
  h2: 'The Agenda',
  tracks: [
    {
      h3: 'The Future of Money and Markets',
      body: 'Macro, stablecoins, payments, and the monetary systems being rebuilt onchain. This track also covers the next generation of market structure, from DEX and CEX trading and liquidity across privacy pools to interoperability and the last mile of settlement.',
    },
    {
      h3: 'Institutional Finance and Onchain Capital Markets',
      body: 'Tokenization, capital markets, and institutional adoption. This track looks at how asset managers, banks, and exchanges are bringing real-world assets onchain, and what it takes to move from pilots to production at scale.',
    },
    {
      h3: 'Confidential Infrastructure',
      body: 'Confidential execution, selective disclosure for compliance, quantum-safe cryptography, and formally verified code. This track examines the stack underneath confidential markets, including the Bunker Mode debate over how far security should go when a system has to survive the worst case.',
    },
    {
      h3: 'Agentic Finance',
      body: 'Agentic commerce, autonomous trading, programmable money, and payments. This track looks at AI agents as market participants, and at the rails, permissions, and settlement the agent economy needs before institutions let agents move capital.',
    },
  ],
};

export const audience = {
  h2: 'Who’s in the Room',
  body: 'Enclave is built for the people who decide where institutional capital goes next. Every seat is held by invitation:',
  list: [
    'Chief investment officers, portfolio managers, and heads of digital assets at global banks, asset managers, and exchanges',
    'Partners at hedge funds, venture firms, and family offices',
    'Founders and executives building confidential finance infrastructure',
    'Cryptographers and security researchers working on confidential computation',
    'Policymakers and regulators shaping digital asset rules',
    'Senior leaders across New York finance and technology',
    'A select group of journalists, podcasters, and analysts',
  ],
};

export const partners = {
  h2: 'Partners',
  body: 'Enclave is chain-agnostic by design. NEAR hosts, and the agenda spans the industry.',
  groups: [
    {
      h3: 'Ecosystem Partners',
      // logo: optional path under /assets/logos/partners/. Falls back to wordmark text.
      logos: [
        { name: 'Midnight', logo: '' },
        { name: 'Zcash', logo: '' },
      ],
    },
    {
      h3: 'Media Partners',
      logos: [
        { name: 'Bankless', logo: '' },
        { name: 'The Rollup', logo: '' },
        { name: 'Wall Street Bets', logo: '' },
      ],
    },
  ],
};

export const speakers = {
  h2: 'Speakers',
  body: 'Speakers to be announced. Request an invitation to hear first.',
};

export const closing = {
  h2: 'Request an Invitation',
  body: 'Attendance is limited and by invitation.',
  cta: 'Request an invitation',
};

// TODO: replace placeholder emails with real addresses.
export const contact = {
  press: 'press@near.org',
  sponsorship: 'sponsorship@near.org',
};

export const faq = {
  h2: 'FAQ',
  items: [
    {
      q: 'Who should attend?',
      a: 'Senior leaders at financial institutions, investors, and builders working on onchain markets, confidential finance, and agentic finance.',
    },
    {
      q: 'How do invitations work?',
      a: 'Submit a request. The team reviews every request and confirms by email.',
    },
    {
      q: 'Who hosts Enclave?',
      a: 'NEAR hosts Enclave. The program is chain-agnostic, with speakers and partners from across the industry.',
    },
    {
      q: 'Where is the venue?',
      a: 'A Manhattan venue will be announced soon.',
    },
    {
      q: 'Press and sponsorship inquiries',
      // Rendered as: Press: <email> · Sponsorship: <email>
      a: '',
      contact: true,
    },
  ],
};

// Section ids used for nav anchors (shared so both versions link the same).
export const nav = [
  { id: 'shift', label: 'The Shift' },
  { id: 'format', label: 'Format' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'audience', label: 'Who’s in the Room' },
  { id: 'partners', label: 'Partners' },
  { id: 'faq', label: 'FAQ' },
];

// Invitation request form fields (UI only, no backend yet).
export const form = {
  title: 'Request an invitation',
  intro: 'Attendance is limited and by invitation. The team reviews every request and confirms by email.',
  fields: [
    { name: 'name', label: 'Full name', type: 'text', autocomplete: 'name', required: true },
    { name: 'email', label: 'Work email', type: 'email', autocomplete: 'email', required: true },
    { name: 'company', label: 'Organization', type: 'text', autocomplete: 'organization', required: true },
    { name: 'role', label: 'Title', type: 'text', autocomplete: 'organization-title', required: true },
  ],
  segment: {
    label: 'I am attending as',
    options: ['Institution', 'Investor', 'Builder', 'Press', 'Policy'],
  },
  submit: 'Submit request',
  success: 'Request received. The team will confirm by email.',
};

// ── Apply-to-attend revision (Web Copy doc, Oct 2026). Used by v3b-near, v3b-nearcon, v3d-near, v3d-nearcon.
// Older pages keep the invitation copy above.
export const metaApply = {
  ...meta,
  description: 'A one-day, apply to attend New York City summit for institutions moving onchain. April 2027.',
};

export const heroApply = {
  ...hero,
  subhead:
    'One day in NYC for the institutions moving global markets onchain, and for the question that decides how far they go: how to keep money confidential on open networks.',
  cta: 'Apply to Attend',
};

// The doc ships The Shift body as one paragraph; shift.body above is the same text split by sentence.
export const shiftParagraph = shift.body.join(' ');

export const formApply = {
  ...form,
  title: 'Apply to Attend',
  intro: 'The team reviews every request and confirms by email.',
  submit: 'Submit application',
};

// The doc ships Format + New York body as one paragraph.
export const formatParagraph = format.body.join(' ');
