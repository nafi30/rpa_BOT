/** Keep a listing tied to the same profile and sender inbox when a run resumes. */
export function selectProfileIndex(sourceIndex, profileCount, strategy, leadsPerProfile) {
  if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || !Number.isInteger(profileCount) || profileCount < 1) {
    throw new Error('Invalid profile rotation inputs.');
  }
  if (strategy === 'round-robin') return sourceIndex % profileCount;
  if (!Number.isInteger(leadsPerProfile) || leadsPerProfile < 1) {
    throw new Error('LEADS_PER_PROFILE must be a positive integer.');
  }
  return Math.floor(sourceIndex / leadsPerProfile) % profileCount;
}

export function selectSenderEmail(sourceIndex, emails) {
  if (!Number.isInteger(sourceIndex) || sourceIndex < 0) throw new Error('Invalid email rotation position.');
  if (!Array.isArray(emails) || emails.length === 0) return '';
  return emails[sourceIndex % emails.length];
}
