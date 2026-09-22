// Forge's configuration is read from ENV on every call, and ENV is a plain
// object, so tests switch Forge on and off by assigning to it. Every file that
// does must restore it afterwards: restoreForge puts back what the file started
// with.
import { ENV } from "../_core/env";

const original = { url: ENV.forgeApiUrl, key: ENV.forgeApiKey };

export function configureForge(url: string, key: string): void {
  ENV.forgeApiUrl = url;
  ENV.forgeApiKey = key;
}

export const forgeOn = (): void => configureForge("https://forge.example.test", "forge-key");

export const forgeOff = (): void => configureForge("", "");

export const restoreForge = (): void => configureForge(original.url, original.key);
