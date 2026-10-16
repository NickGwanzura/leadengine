import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { normalizeWebsite } from './validation';
export function isPublicAddress(ip:string):boolean {
 if(isIP(ip)===4){const [a,b]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2))||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19||b===51))||(a===203&&b===0));}
 if(isIP(ip)===6){const s=ip.toLowerCase();return /^[23][0-9a-f]{3}:/.test(s)&&!s.startsWith('2001:db8:')&&!s.startsWith('2002:')&&!s.startsWith('2001:0:');}
 return false;
}
export async function validatePublicUrl(raw:string){const normalized=normalizeWebsite(raw);if(!normalized.website)throw new Error('Website required');const url=new URL(normalized.website);const host=url.hostname.replace(/^\[|\]$/g,'');const addresses=await lookup(host,{all:true});if(!addresses.length||addresses.some(a=>!isPublicAddress(a.address)))throw new Error('Public addresses only');return normalized;}
