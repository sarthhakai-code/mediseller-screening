import site from './site.js';
export const faqGroups = [
  { title: 'Ordering', items: [
    ['How do I order?', 'Search for your medicine, add it to your cart and tap “Proceed to request quote”. Share your details, optionally upload your prescription, and choose WhatsApp, email or a call. An agent confirms everything with you before you pay.'],
    ['Why are prices not shown?', 'Prices depend on the brand, quantity, your country and shipping method, and change with availability. Your agent gives you the best current price for your exact order.'],
    ['How quickly will I get a quote?', 'Usually within a few working hours (India time). WhatsApp is the fastest channel.'],
    ['Can you source a medicine that is not listed?', 'Very often, yes. We list only part of what we can source. Send us the name (or a photo of the pack or prescription) on WhatsApp.'],
    ['Do I need to create an account?', 'No. There are no accounts — just send your request and keep your reference number.'],
  ] },
  { title: 'Prescriptions & safety', items: [
    ['Do I need a prescription?', 'Prescription-only medicines are dispatched only against a valid prescription from your doctor. Uploading at checkout is optional — you can share it with your agent later.'],
    ['Are the medicines genuine?', 'We supply medicines made by licensed manufacturers and sourced through authorised channels in India, with invoices. Your agent can share batch and expiry details before dispatch.'],
    ['Can you advise me which medicine or dose to take?', 'No. We do not provide medical advice. Please follow your doctor’s prescription.'],
  ] },
  { title: 'Shipping & payment', items: [
    ['Which countries do you ship to?', `We ship to ${site.shippingRegions.map((r) => r.region).join(', ')} and more. See the shipping page or ask your agent.`],
    ['How long does delivery take?', 'It depends on your country and the shipping method. Your agent confirms an estimated delivery time in your quote.'],
    ['Do you ship insulin and other cold-chain medicines?', 'Yes, in temperature-controlled packaging, to countries where transit times allow it.'],
    ['How do I pay?', 'Payment options are shared by your agent after you accept the quote. We never ask for card details on the website or in chat.'],
    ['Will customs or import rules apply?', 'Import rules differ by country, especially for personal-use imports. Your agent will tell you what is known for your country; you are responsible for complying with local regulations.'],
  ] },
];
