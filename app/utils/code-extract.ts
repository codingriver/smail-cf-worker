function buildLengthPattern(length: string | null): RegExp {
	const parsed = Number(length);
	if (Number.isInteger(parsed) && parsed >= 3 && parsed <= 12) {
		return new RegExp(`(?<!\\d)\\d{${parsed}}(?!\\d)`, "g");
	}
	return /\b\d{4,8}\b/g;
}

export function extractVerificationCodes(input: string, length: string | null) {
	const pattern = buildLengthPattern(length);
	const seen = new Set<string>();
	const candidates: string[] = [];
	for (const match of input.matchAll(pattern)) {
		const code = match[0];
		if (!seen.has(code)) {
			seen.add(code);
			candidates.push(code);
		}
	}
	return candidates;
}
