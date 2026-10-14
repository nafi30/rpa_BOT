/**
 * Selector definitions and domain-specific rules for form fields.
 */

export const defaultSelectors = {
  // Full Name or Single Name field
  name: [
    'input[name*="name" i]:not([name*="first" i]):not([name*="last" i])',
    'input[id*="name" i]:not([id*="first" i]):not([id*="last" i])',
    'input[placeholder*="name" i]:not([placeholder*="first" i]):not([placeholder*="last" i])',
    'input[autocomplete="name"]',
    'input[aria-label*="name" i]',
    'input[name="fullname" i]',
  ],

  // Split First / Last Name fields
  firstName: [
    'input[name*="first" i]',
    'input[id*="first" i]',
    'input[placeholder*="first" i]',
    'input[autocomplete="given-name"]',
  ],
  lastName: [
    'input[name*="last" i]',
    'input[id*="last" i]',
    'input[placeholder*="last" i]',
    'input[autocomplete="family-name"]',
  ],

  // Email Address
  email: [
    'input[type="email"]',
    'input[name*="email" i]',
    'input[id*="email" i]',
    'input[placeholder*="email" i]',
    'input[autocomplete="email"]',
    'input[aria-label*="email" i]',
  ],

  // Phone Number
  phone: [
    'input[type="tel"]',
    'input[name*="phone" i]',
    'input[name*="tel" i]',
    'input[id*="phone" i]',
    'input[placeholder*="phone" i]',
    'input[name*="mobile" i]',
    'input[name*="cell" i]',
    'input[autocomplete="tel"]',
  ],

  // Inquiry / Message Box
  message: [
    'textarea[name*="message" i]',
    'textarea[id*="message" i]',
    'textarea[placeholder*="message" i]',
    'textarea[name*="inquiry" i]',
    'textarea[name*="comment" i]',
    'textarea[name*="body" i]',
    'textarea[name*="note" i]',
    'textarea', // General textarea fallback
  ],

  // Consent / Terms Checkbox (opt-in if required)
  consent: [
    'input[type="checkbox"][name*="terms" i]',
    'input[type="checkbox"][name*="consent" i]',
    'input[type="checkbox"][name*="privacy" i]',
    'input[type="checkbox"][name*="agree" i]',
    'input[type="checkbox"][id*="terms" i]',
    'input[type="checkbox"][id*="consent" i]',
  ],

  // Modal / Contact Opener Triggers (when forms are gated behind buttons)
  modalTriggers: [
    'button:has-text("Contact")',
    'button:has-text("Send Message")',
    'button:has-text("Inquire")',
    'button:has-text("Check Availability")',
    'button:has-text("Schedule Tour")',
    'button:has-text("Request Info")',
    'a:has-text("Contact")',
    'a:has-text("Inquire")',
    'a:has-text("Send Message")',
    '[role="button"]:has-text("Contact")',
    '[role="button"]:has-text("Send Message")',
  ],

  // Checkboxes or toggles required to reveal the inquiry/message textarea
  customMessageToggles: [
    '#custom-message',
    'input#custom-message',
    'label[for="custom-message"]',
    'label:has-text("Custom Message")',
    ':has-text("Custom Message") input[type="checkbox"]',
  ],

  // Submit button
  submit: [
    '#contactFormAction',
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Send Message")',
    'button:has-text("Send Inquiry")',
    'button:has-text("Submit Inquiry")',
    'button:has-text("Contact Agent")',
    'button:has-text("Contact Property")',
    'button:has-text("Contact")',
    'button:has-text("Submit")',
    'button:has-text("Send")',
    'button:has-text("Request Info")',
    '[role="button"]:has-text("Send")',
    '[role="button"]:has-text("Submit")',
  ],

  // Success indicators (DOM messages that appear after successful submission)
  successIndicators: [
    '.success-message',
    '.alert-success',
    '.wpcf7-mail-sent-ok',
    ':has-text("Thank you")',
    ':has-text("Your message has been sent")',
    ':has-text("Thanks for reaching out")',
    ':has-text("Inquiry submitted")',
    ':has-text("We will get back to you")',
    ':has-text("Success")',
  ],
};

/**
 * Domain-specific overrides.
 * Key should be the normalized domain name (e.g. 'zillow.com', 'example.com').
 */
export const domainConfigs = {
  'hotpads.com': {
    modalTriggers: [
      'button:has-text("Message")',
      'button:has-text("Contact Property")',
      'button:has-text("Check Availability")',
      'button:has-text("Send Message")',
      'button:has-text("Request a Tour")',
      'a:has-text("Contact")',
    ],
    name: [
      '#halo-inline-contact-userName',
      'input[name="name"]',
      'input[id*="name" i]',
      'input[placeholder*="Name" i]',
      '#lead-form-name',
    ],
    email: [
      '#halo-inline-contact-userEmail',
      'input[name="email"]',
      'input[type="email"]',
      'input[id*="email" i]',
      '#lead-form-email',
    ],
    phone: [
      '#halo-inline-contact-userPhoneNumber',
      'input[name="phone"]',
      'input[type="tel"]',
      'input[id*="phone" i]',
      '#lead-form-phone',
    ],
    message: [
      '#halo-inline-contact-userMessage',
      'textarea[name="message"]',
      'textarea[id*="message" i]',
      'textarea[placeholder*="Message" i]',
      '#lead-form-message',
      'textarea',
    ],
    submit: [
      'button:has-text("Send Message")',
      'button:has-text("Send Inquiry")',
      'button:has-text("Contact Property")',
      'button[type="submit"]',
      '#contact-form-submit',
    ],
  },
  'apartments.com': {
    modalTriggers: [
      '#sendMessageBtn',
      'button#sendMessageBtn',
      '.sendMessageBtn',
      '#contactProperty',
      'button#contactProperty',
      '.contactProperty',
      '.ctaButton.contactProperty',
      'button:has-text("Send Message")',
      'button:has-text("Contact This Property")',
      'button:has-text("Contact Property")',
      'a:has-text("Contact This Property")',
      '#btnContactProperty',
      'button:has-text("Check Availability")',
      'a:has-text("Send Message")',
    ],
    customMessageToggles: [
      '#custom-message',
      'input#custom-message',
      'label[for="custom-message"]',
      'label:has-text("Custom Message")',
      ':has-text("Custom Message") input[type="checkbox"]',
    ],
    name: [
      '#contactFormFirstName',
      'input#name',
      'input[name="name"]',
      'input[placeholder*="Name" i]',
      'input[name*="name" i]',
    ],
    firstName: [
      '#contactFormFirstName',
      '.contactFormFirstName',
      'input#firstName',
      'input[name="firstName"]',
      'input[name*="first" i]',
    ],
    lastName: [
      '#contactFormLastName',
      '.contactFormLastName',
      'input#lastName',
      'input[name="lastName"]',
      'input[name*="last" i]',
    ],
    email: [
      '#contactFormEmail',
      '.contactFormEmail',
      'input#email',
      'input[name="email"]',
      'input[type="email"]',
      'input[name*="email" i]',
    ],
    phone: [
      '#phone',
      '.contactFormPhoneNumber',
      'input[name*="phone" i]',
      'input#phone',
      'input[name="phone"]',
      'input[type="tel"]',
    ],
    message: [
      '#contactFormMessage',
      '.contactFormMessage',
      'textarea#message',
      'textarea[name="message"]',
      'textarea[placeholder*="Message" i]',
      '#leadForm textarea',
      'textarea',
    ],
    submit: [
      '#contactFormAction',
      'a#contactFormAction',
      '.contactFormAction',
      ':is(button, a, [role="button"]):has-text("Send Message")',
      '#btnSendLead',
      'button:has-text("Send Message")',
      'button:has-text("Contact Property")',
      'button[type="submit"]',
      'button.send-btn',
    ],
  },
  'example.com': {
    name: ['#contact-name'],
    email: ['#contact-email'],
    phone: ['#contact-phone'],
    message: ['#contact-message'],
    submit: ['#contact-submit'],
  },
};

/**
 * Resolves the appropriate selectors for a given URL.
 * Merges domain-specific rules with default fallbacks.
 * @param {string} urlString
 * @returns {Object}
 */
export function getSelectorsForUrl(urlString) {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.replace(/^www\./, '').toLowerCase();

    for (const [domain, customSelectors] of Object.entries(domainConfigs)) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return {
          ...defaultSelectors,
          ...customSelectors,
        };
      }
    }
  } catch {
    // If invalid URL, return defaults
  }

  return defaultSelectors;
}

export default {
  defaultSelectors,
  domainConfigs,
  getSelectorsForUrl,
};
