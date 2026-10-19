import {it,expect} from 'vitest';
import {hashPassword,verifyPassword,newToken,tokenHash} from '../apps/api/src/auth.js';
import {messageSchema} from '../packages/shared/src/index.js';
it('salts password hashes and rejects invalid passwords',()=>{const first=hashPassword('a-long-password');const second=hashPassword('a-long-password');expect(first).not.toBe(second);expect(verifyPassword('a-long-password',first)).toBe(true);expect(verifyPassword('wrong',first)).toBe(false);});
it('generates opaque refresh tokens and hashes only',()=>{const token=newToken();expect(token).not.toBe(newToken());expect(tokenHash(token)).toHaveLength(64);expect(tokenHash(token)).not.toContain(token);});
it('rejects arbitrary proxy messages and excessive payload fields',()=>{expect(messageSchema.safeParse({type:'FETCH',url:'https://example.com'}).success).toBe(false);expect(messageSchema.safeParse({type:'SCAN',username:'example',mode:'quick',url:'https://example.com'}).success).toBe(false);});
