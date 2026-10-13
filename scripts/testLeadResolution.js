import { loadLeads } from '../lib/dataManager.js';
import { generateMessage } from '../lib/spintaxEngine.js';
import { config } from '../config.js';

async function main() {
  const leads = await loadLeads(config.files.inputLeads);
  console.log(`Loaded ${leads.length} leads from ${config.files.inputLeads}`);
  console.log(`Configured Email Pool (${config.sender.emails.length}):`, config.sender.emails);

  leads.forEach((lead, i) => {
    if (!lead.email && config.sender.emails.length > 0) {
      const emailIndex = i % config.sender.emails.length;
      lead.email = config.sender.emails[emailIndex];
    }
    if (!lead.name || lead.name === 'Interested Buyer' || lead.name.toLowerCase() === 'henry') {
      lead.name = config.sender.defaultName || 'Hassam Abbas';
    }
    if (!lead.phone && config.sender.defaultPhone) {
      lead.phone = config.sender.defaultPhone;
    }
    const resolvedMsg = generateMessage({ rawMessage: lead.message, leadName: lead.name });
    console.log(`\n--- Lead #${i + 1} ---`);
    console.log(`URL: ${lead.url}`);
    console.log(`Name: ${lead.name}`);
    console.log(`Email (Rotated): ${lead.email}`);
    console.log(`Phone: ${lead.phone}`);
    console.log(`Message (Spintax): "${resolvedMsg.slice(0, 100)}..."`);
  });
}

main().catch(console.error);
