import site from '@site/site.config.mjs';
export default site;

export const waLink = (text = '', number = site.contact.whatsapp) =>
  `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

export const allCountries = () => site.shippingRegions.flatMap((r) => r.countries);
