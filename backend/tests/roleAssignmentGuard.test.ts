import { assertCanAssignRole, RoleAssignmentError } from '../src/middlewares/auth';

describe('assertCanAssignRole', () => {
    it('blocks a Manager from assigning the Admin role', () => {
        expect(() => assertCanAssignRole('Manager', 'Admin')).toThrow(RoleAssignmentError);
    });

    it('blocks case-insensitively (admin / ADMIN)', () => {
        expect(() => assertCanAssignRole('Manager', 'admin')).toThrow(RoleAssignmentError);
        expect(() => assertCanAssignRole('Manager', 'ADMIN')).toThrow(RoleAssignmentError);
    });

    it('allows an Admin to assign the Admin role', () => {
        expect(() => assertCanAssignRole('Admin', 'Admin')).not.toThrow();
    });

    it('allows a Manager to assign non-admin roles', () => {
        expect(() => assertCanAssignRole('Manager', 'Employee')).not.toThrow();
        expect(() => assertCanAssignRole('Manager', 'Intern')).not.toThrow();
        expect(() => assertCanAssignRole('Manager', 'Manager')).not.toThrow();
    });

    it('exposes a stable error code for controller mapping', () => {
        try {
            assertCanAssignRole('Manager', 'Admin');
            throw new Error('expected to throw');
        } catch (err) {
            expect(err).toBeInstanceOf(RoleAssignmentError);
            expect((err as RoleAssignmentError).code).toBe('ROLE_ASSIGNMENT_FORBIDDEN');
        }
    });
});
