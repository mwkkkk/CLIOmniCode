/**
 * 展开配置中的 ${VAR} 环境变量占位符
 */
export function expandEnvValue(value: string): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name: string) => process.env[name] ?? '');
}

export function expandEnvRecord(
  env: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!env) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    out[key] = expandEnvValue(value);
  }
  return out;
}
