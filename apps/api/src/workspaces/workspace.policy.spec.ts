import { describe, expect, it } from 'vitest'; import { canGrant, requireManager } from './workspace.policy';
describe('workspace role hierarchy', () => {
  it('denies editor/viewer management', () => { expect(() => requireManager('EDITOR')).toThrow(); expect(() => requireManager('VIEWER')).toThrow(); });
  it('prevents administrators creating administrators or changing an owner/admin', () => { expect(() => canGrant('ADMIN', 'ADMIN')).toThrow(); expect(() => canGrant('ADMIN', 'EDITOR', 'ADMIN')).toThrow(); expect(() => canGrant('ADMIN', 'VIEWER', 'OWNER')).toThrow(); expect(() => canGrant('ADMIN', 'EDITOR', 'VIEWER')).not.toThrow(); });
  it('prevents owner removal/escalation and allows owner to manage non-owner roles', () => { expect(() => canGrant('OWNER', 'OWNER')).toThrow(); expect(() => canGrant('OWNER', 'ADMIN', 'OWNER')).toThrow(); expect(() => canGrant('OWNER', 'ADMIN', 'EDITOR')).not.toThrow(); });
});
