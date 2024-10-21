// eslint-disable-next-line import/no-cycle
import { fetchPlaceholders, sampleRUM } from './aem.js';

// Core Web Vitals RUM collection
sampleRUM('cwv');

// add more delayed functionality here

// CMP consent
try {
  await fetchPlaceholders();
} catch (e) { /* ignore */ }
