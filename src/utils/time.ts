const RELATIVE_TIME_REGEX = /^(\d+)(m|h|d)$/;

export function resolveTime(input: string): string {
  if (input.includes("T") || input.includes("-")) {
    return input;
  }

  const match = input.match(RELATIVE_TIME_REGEX);
  if (!match) {
    throw new Error(
      `Invalid time format: "${input}". Use ISO 8601 (e.g., "2026-02-18T10:00:00Z") or relative (e.g., "15m", "1h", "7d").`
    );
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];
  const now = new Date();

  switch (unit) {
    case "m":
      now.setMinutes(now.getMinutes() - value);
      break;
    case "h":
      now.setHours(now.getHours() - value);
      break;
    case "d":
      now.setDate(now.getDate() - value);
      break;
  }

  return now.toISOString();
}

export function parseTimeRange(
  from?: string,
  to?: string
): { from: string; to: string } {
  return {
    from: resolveTime(from ?? "15m"),
    to: to ? resolveTime(to) : new Date().toISOString(),
  };
}
