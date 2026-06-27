import { getSession } from "~/.server/session";
import { MAIL_RETENTION_MS } from "~/utils/mail-retention";

export type ApiAuth =
	| {
			role: "session";
			addresses: string[];
			addressIssuedAt?: number;
	  }
	| {
			role: "api";
			token: string;
	  }
	| {
			role: "admin";
			token: string;
	  };

const encoder = new TextEncoder();

function parseSecretList(value?: string): string[] {
	return (value ?? "")
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

function getBearerToken(request: Request): string | null {
	const header = request.headers.get("Authorization");
	if (!header) {
		return null;
	}

	const match = header.match(/^Bearer\s+(.+)$/i);
	return match?.[1]?.trim() || null;
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
	const aBytes = encoder.encode(a);
	const bBytes = encoder.encode(b);
	if (aBytes.byteLength !== bBytes.byteLength) {
		return false;
	}

	const aDigest = await crypto.subtle.digest("SHA-256", aBytes);
	const bDigest = await crypto.subtle.digest("SHA-256", bBytes);
	const aHash = new Uint8Array(aDigest);
	const bHash = new Uint8Array(bDigest);
	let diff = 0;
	for (let i = 0; i < aHash.byteLength; i++) {
		diff |= aHash[i] ^ bHash[i];
	}
	return diff === 0;
}

async function tokenMatches(token: string, candidates: string[]): Promise<boolean> {
	for (const candidate of candidates) {
		if (await timingSafeEqual(token, candidate)) {
			return true;
		}
	}
	return false;
}

export function isSessionExpired(auth: ApiAuth, now = Date.now()): boolean {
	return (
		auth.role === "session" &&
		typeof auth.addressIssuedAt === "number" &&
		now - auth.addressIssuedAt >= MAIL_RETENTION_MS
	);
}

export function canAccessAddress(auth: ApiAuth, address: string): boolean {
	if (auth.role === "admin") {
		return true;
	}
	if (auth.role === "session") {
		return !isSessionExpired(auth) && auth.addresses.includes(address);
	}
	return false;
}

export async function getApiAuth(
	request: Request,
	env: Pick<Env, "ADMIN_API_TOKENS" | "API_TOKENS">,
): Promise<ApiAuth | null> {
	const token = getBearerToken(request);
	if (token) {
		if (await tokenMatches(token, parseSecretList(env.ADMIN_API_TOKENS))) {
			return { role: "admin", token };
		}
		if (await tokenMatches(token, parseSecretList(env.API_TOKENS))) {
			return { role: "api", token };
		}
		return null;
	}

	const session = await getSession(request.headers.get("Cookie"));
	const addresses = (session.get("addresses") || []) as string[];
	if (addresses.length === 0) {
		return null;
	}

	return {
		role: "session",
		addresses,
		addressIssuedAt: session.get("addressIssuedAt"),
	};
}

export async function requireApiAuth(
	request: Request,
	env: Pick<Env, "ADMIN_API_TOKENS" | "API_TOKENS">,
): Promise<ApiAuth> {
	const auth = await getApiAuth(request, env);
	if (!auth) {
		throw new Response("Unauthorized", { status: 401 });
	}
	return auth;
}
