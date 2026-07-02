/**
 * Custom ESLint Plugin for Gainium Spacing and Styling Rules
 */

import noHardcodedFontSize from './no-hardcoded-font-size.js';
import rechartsExplicitAnimation from './recharts-explicit-animation.js';

export default {
  rules: {
    'no-hardcoded-font-size': noHardcodedFontSize,
    'recharts-explicit-animation': rechartsExplicitAnimation,
  },
};
