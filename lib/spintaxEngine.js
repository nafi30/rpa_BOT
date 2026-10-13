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
 * Pre-defined real-estate inquiry Spintax templates for HotPads and Apartments.com.
 * Used whenever a lead doesn't have a customized message in the CSV.
 */
export const defaultMessageTemplates = [
  '{Hi|Hello|Good day}, {I saw|I noticed|I am writing regarding} {this listing|your property|this apartment} on {the platform|HotPads|Apartments.com}. {Is it still available for rent?|Could you let me know if this unit is still available?|Is this property currently open for leasing?} {I am looking to relocate soon|I am interested in scheduling a showing|I would love to get more details on the lease terms}. {Please reach back out to me at your earliest convenience.|Thank you so much, hope to hear from you soon.|Looking forward to your reply.}',
  
  '{Hello|Hi there}, {I came across your listing|I am interested in this rental unit}. {Could you provide details on the pet policy and HOA fees?|What are the current move-in requirements and lease duration?|Are you currently accepting applications for this property?} {Please feel free to email or call me with available showing times.|I would appreciate a quick update on availability.} {Best regards|Thanks in advance|Sincerely},',

  '{Hi|Good morning|Hello}, {I am very interested in this property.|I would love to schedule a tour to see this unit.} {Do you have any private showing slots open this week or upcoming weekend?|When is the earliest date available for a walk-through?} {Please send over the application process and requirements.|Looking forward to discussing further.} {Thank you|Thanks|Warm regards},',

  '{Hello|Hi}, {is this unit currently on the market?|I am inquiring about the availability of this listing.} {I am a qualified prospective tenant looking for a smooth lease start.|My move-in timeline is flexible and I can provide all necessary background documentation.} {Please contact me with more information.|Hope to hear from you soon.}'
];

/**
 * Generates a unique, personalized message for a lead.
 * @param {Object} options
 * @param {string} [options.rawMessage] - Optional custom message from lead CSV (supports spintax)
 * @param {string} [options.leadName] - Name of prospective tenant
 * @param {string} [options.propertyName] - Optional property title or address
 * @returns {string} Resolved message string
 */
export function generateMessage({ rawMessage = '', leadName = '', propertyName = '' } = {}) {
  let template = rawMessage;

  // If no message provided in the lead record, pick one from the configured custom pool or default pool
  if (!template || template.trim().length === 0) {
    const pool = (config?.sender?.customMessages && config.sender.customMessages.length > 0)
      ? config.sender.customMessages
      : defaultMessageTemplates;
    const randomIndex = Math.floor(Math.random() * pool.length);
    template = pool[randomIndex];
  }

  // Parse spintax variations
  let message = parseSpintax(template);

  // Variable interpolation (e.g. {{name}}, {{property}})
  if (leadName) {
    message = message.replace(/\{\{name\}\}/gi, leadName);
  }
  if (propertyName) {
    message = message.replace(/\{\{property\}\}/gi, propertyName);
  }

  return message;
}

export default {
  parseSpintax,
  defaultMessageTemplates,
  generateMessage,
};
