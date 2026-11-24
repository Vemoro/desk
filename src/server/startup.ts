import { definePlugin } from 'nitro';
import { configuredOrigin } from './origin';

export default definePlugin(() => {
  configuredOrigin();
});
