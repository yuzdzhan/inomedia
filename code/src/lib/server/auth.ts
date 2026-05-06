import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { getRequestEvent } from '$app/server';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { db } from './db';

const projectDomain = process.env.PROJECT_DOMAIN;
const trustedOrigins = [
	process.env.BETTER_AUTH_URL,
	'http://localhost:3000',
	projectDomain ? `http://${projectDomain}` : null,
	projectDomain ? `http://${projectDomain}:3000` : null,
	projectDomain ? `https://${projectDomain}` : null
].filter((origin): origin is string => Boolean(origin));

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
	trustedOrigins,
	plugins: [sveltekitCookies(getRequestEvent)]
});
