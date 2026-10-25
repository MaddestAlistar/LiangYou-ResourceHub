// The review repository is public. Never persist contact email in plaintext.
const utf8 = new TextEncoder();
export function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && (!value || /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value));
}
const pack = bytes => btoa(String.fromCharCode(...bytes));
const unpack = value => Uint8Array.from(atob(value), x => x.charCodeAt(0));
async function key(secret) {
  if (typeof secret !== 'string' || secret.length < 24) throw Error('Contact encryption is not configured');
  const material = await crypto.subtle.importKey('raw', utf8.encode(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF', hash:'SHA-256', salt:utf8.encode('LiangYou-Icon-Review'), info:utf8.encode('contact-email-v1')}, material, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
}
export async function sealEmail(email, id, env) {
  if (!validEmail(email)) throw Error('Invalid email');
  if (!email) return undefined;
  const source = env.CONTACT_EMAIL_KEY ? 'contact' : 'admin';
  const secret = source === 'contact' ? env.CONTACT_EMAIL_KEY : env.ADMIN_KEY;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:utf8.encode(id)}, await key(secret), utf8.encode(email));
  return {v:1, source, iv:pack(iv), data:pack(new Uint8Array(data))};
}
export async function adminMetadata(meta, env) {
  const {contactEmailEncrypted, email:legacyEmail, ...safe} = meta;
  if (!contactEmailEncrypted) return {...safe, email:validEmail(legacyEmail) ? legacyEmail : ''};
  const envelope = contactEmailEncrypted;
  const secrets = envelope.source === 'contact' ? [env.CONTACT_EMAIL_KEY, env.CONTACT_EMAIL_PREVIOUS_KEY] : [env.ADMIN_KEY, env.CONTACT_EMAIL_PREVIOUS_ADMIN_KEY];
  for (const secret of secrets.filter(Boolean)) {
    try {
      if (envelope.v !== 1 || !['contact','admin'].includes(envelope.source)) throw Error('Unknown contact format');
      const plaintext = await crypto.subtle.decrypt({name:'AES-GCM', iv:unpack(envelope.iv), additionalData:utf8.encode(meta.id)}, await key(secret), unpack(envelope.data));
      const email = new TextDecoder().decode(plaintext);
      if (!email || !validEmail(email)) throw Error('Invalid contact');
      return {...safe, email};
    } catch { /* Try a retained key after secret rotation. */ }
  }
  return {...safe, email:'', emailUnavailable:true};
}
