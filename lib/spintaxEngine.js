import { config } from '../config.js';

/**
 * Parses nested spintax patterns enclosed in curly braces {opt1|opt2|opt3}.
 * @param {string} text - Text containing spintax syntax
 * @returns {string} Fully resolved unique message
 */
export function parseSpintax(text = '') {
  if (!text || typeof text !== 'string') return '';

  const spintaxRegex = /\{([^{}]+)\}/;
  let result = text;

  // Loop until all nested spintax blocks are resolved
  while (spintaxRegex.test(result)) {
    result = result.replace(spintaxRegex, (match, choices) => {
      const options = choices.split('|');
      const picked = options[Math.floor(Math.random() * options.length)];
      return picked.trim();
    });
  }

  // Clean up any double spaces or formatting artifacts
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Henry's approved first outreach from the Property Acquisition Script Deck.
 * Blank sheet messages use this one template. Follow-ups are handled outside this bot.
 */
export const initialOutreachTemplate =
  'Hello,\n\n' +
  'We are interested in leasing multiple units there for 12 months, if you are not opposed to corporate leases?\n\n' +
  'Regards,\n{{name}}\n{{company}}';

// Keep the existing export for callers, but there is only one first message.
export const defaultMessageTemplates = [initialOutreachTemplate];

/**
 * Resolve a row-specific message or the fixed first outreach message.
 */
export function generateMessage({ rawMessage = '', leadName = '', propertyName = '' } = {}) {
  const hasCustomMessage = typeof rawMessage === 'string' && rawMessage.trim().length > 0;
  let message = hasCustomMessage ? parseSpintax(rawMessage) : initialOutreachTemplate;
  message = message.replace(/\{\{name\}\}/gi, leadName || config.sender.defaultName);
  message = message.replace(/\{\{company\}\}/gi, config.sender.defaultCompany);
  if (propertyName) message = message.replace(/\{\{property\}\}/gi, propertyName);
  return message;
}

export default {
  parseSpintax,
  defaultMessageTemplates,
  generateMessage,
};
