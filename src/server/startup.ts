import { definePlugin } from 'nitro';
import { requireDatabaseUrl } from './database-url';
import { configuredOrigin } from './origin';

// Nitro catches errors raised inside plugin callbacks. Check before the server starts listening.
requireDatabaseUrl();
configuredOrigin();
export default definePlugin(() => {});
