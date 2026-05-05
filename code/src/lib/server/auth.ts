import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { db } from './db';

export const auth = betterAuth({
	database: prismaAdapter(db, { provider: 'postgresql' }),
	emailAndPassword: {
		enabled: true,
		autoSignIn: false
	},
	user: {
		additionalFields: {
			firstName: { type: 'string', required: true, defaultValue: '' },
			lastName: { type: 'string', required: true, defaultValue: '' },
			role: { type: 'string', required: true, defaultValue: 'employee' },
			status: { type: 'string', required: true, defaultValue: 'active' },
			deactivatedAt: { type: 'date', required: false }
		}
	},
	session: {
		cookieCache: { enabled: true, maxAge: 60 * 60 * 24 }
	},
	trustedOrigins: [process.env.BETTER_AUTH_URL ?? 'http://localhost:3000']
});
