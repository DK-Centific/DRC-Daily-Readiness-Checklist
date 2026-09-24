/**
 * A saved sign-in is only an email to check again.
 * The app shell stays closed until login returns the person, including role.
 */

export function planSessionRestore(saved) {
  const email = typeof saved?.email === 'string' ? saved.email.trim() : '';
  const name = typeof saved?.name === 'string' ? saved.name.trim() : '';
  if (!email || !name) return { action: 'show-login', email: '', name: '' };
  return { action: 'revalidate', email, name };
}

/** Fields the page may keep from a login response. Client storage is not a login response. */
export function acceptedLoginUser(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!email || !name) return null;
  return {
    email,
    name,
    firstName: typeof payload.firstName === 'string' ? payload.firstName : '',
    lastName: typeof payload.lastName === 'string' ? payload.lastName : '',
    role: typeof payload.role === 'string' ? payload.role : '',
  };
}
