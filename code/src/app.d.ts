declare global {
	namespace App {
		interface Locals {
			user: {
				id: string;
				name: string;
				email: string;
				firstName: string;
				lastName: string;
				role: 'admin' | 'manager' | 'employee' | 'accountant';
				status: 'active' | 'inactive';
			} | null;
			session: { id: string; userId: string; expiresAt: Date } | null;
		}
	}
}

export {};
