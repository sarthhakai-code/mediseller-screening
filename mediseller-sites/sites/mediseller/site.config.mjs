// Site configuration for mediseller.com
// Everything brand- or business-specific lives here. The engine (src/, functions/, server/) never hard-codes it.
// Values wrapped in [ ] are PLACEHOLDERS waiting for client input — see docs/PHASE1-SPEC.md §16.

export default {
  id: 'mediseller',
  name: 'MediSeller',
  domain: 'mediseller.com',
  altDomains: ['mediseller.in', 'www.mediseller.com', 'www.mediseller.in'], // 301 → domain (decision D1)
  refPrefix: 'MS', // lead reference: MS-YYMMDD-XXXX (D9)
  tagline: 'Hard-to-find medicines from India, delivered to your country',
  description:
    'MediSeller helps patients, doctors, importers and resellers worldwide source genuine medicines from India — critical care, oncology, HIV, hepatitis, diabetes and more — with a personal agent for every order.',

  theme: {
    // From the existing MediSeller brand (Mediseller-2.0 design_guidelines.json): white + red.
    primary: '#E11D48',
    primaryHover: '#BE123C',
    accent: '#0F766E', // teal for trust / success accents
    ink: '#0F172A',
    muted: '#64748B',
    surface: '#F8FAFC',
    border: '#E2E8F0',
    headingFont: 'Plus Jakarta Sans',
    bodyFont: 'Inter',
  },

  contact: {
    whatsapp: '911234567890', // [PLACEHOLDER] digits only, with country code
    phone: '+91 12345 67890', // [PLACEHOLDER]
    email: 'sales@mediseller.com', // [PLACEHOLDER]
    address: 'Chandni Chowk, New Delhi, Delhi 110006, India', // [PLACEHOLDER — confirm]
    hours: 'Mon–Sat, 9:00–20:00 IST · WhatsApp replies 7 days',
  },

  legal: {
    company: '[Registered company name]',
    drugLicence: '[Drug licence no.]',
    iec: '[IEC no.]',
    gst: '[GSTIN]',
  },

  checkout: {
    channels: ['whatsapp', 'rfq', 'email', 'call'], // all four always offered
    defaultChannel: 'whatsapp',
    rxUpload: 'optional', // button before checkout; never mandatory
    rxMaxFiles: 3,
    rxMaxMB: 10,
  },

  pricing: 'hidden', // "Get best price" everywhere

  chatbot: {
    enabled: true,
    persona: 'MediSeller Assistant', // D7
    greeting:
      'Hi! I can help you find a medicine, explain how ordering works, or connect you with an agent. What are you looking for?',
  },

  analytics: {
    ga4: '', // e.g. 'G-XXXXXXX' — empty disables
    metaPixel: '', // e.g. '1234567890' — empty disables
    turnstileSiteKey: '', // Cloudflare Turnstile site key — empty disables the widget
  },

  // [PLACEHOLDER] Confirm the real list. Grouped by the priority regions agreed in planning.
  shippingRegions: [
    { region: 'Southeast Asia', countries: ['Vietnam', 'Philippines', 'Indonesia', 'Malaysia', 'Thailand', 'Myanmar', 'Cambodia', 'Laos'] },
    { region: 'Africa', countries: ['Nigeria', 'Kenya', 'Ghana', 'Uganda', 'Tanzania', 'Ethiopia', 'Zambia', 'Cameroon', 'South Africa', 'Egypt'] },
    { region: 'Russia & CIS', countries: ['Russia', 'Kazakhstan', 'Uzbekistan', 'Kyrgyzstan', 'Tajikistan', 'Azerbaijan', 'Armenia', 'Georgia'] },
    { region: 'Eastern Europe', countries: ['Ukraine', 'Moldova', 'Belarus', 'Serbia', 'Romania', 'Bulgaria'] },
    { region: 'Asia & Middle East', countries: ['Nepal', 'Bangladesh', 'Sri Lanka', 'Iraq', 'Yemen', 'Mongolia'] },
  ],

  stats: null, // e.g. [{ value: '40+', label: 'Countries served' }] — hidden until real numbers are supplied
  testimonials: [], // real testimonials only — section hidden while empty

  nav: [
    { label: 'All medicines', href: '/products/' },
    { label: 'How to order', href: '/how-to-order/' },
    { label: 'For business', href: '/for-business/' },
    { label: 'Shipping', href: '/shipping/' },
    { label: 'Contact', href: '/contact/' },
  ],

  locales: ['en'],
};
