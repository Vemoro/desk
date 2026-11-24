import { definePlugin } from 'nitro';
import { requireDatabaseUrl } from './database-url';

// Nitro catches errors raised inside plugin callbacks. Check before the server starts listening.
requireDatabaseUrl();
export default definePlugin(() => {});
