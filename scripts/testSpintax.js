import { generateMessage, parseSpintax } from '../lib/spintaxEngine.js';

console.log('--- TESTING SPINTAX GENERATION ---');
for (let i = 1; i <= 3; i++) {
  console.log(`\nVariation #${i}:`);
  console.log(generateMessage({ leadName: 'Henry' }));
}

console.log('\n--- TESTING CUSTOM SPINTAX ---');
const custom = '{Hello|Hi|Greetings} {landlord|property manager}, I {want to view|am ready to rent} this unit.';
for (let i = 1; i <= 3; i++) {
  console.log(`Custom #${i}: ${parseSpintax(custom)}`);
}
