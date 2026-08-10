/**
 * Custom ESLint Plugin for Gainium Spacing and Styling Rules
 */

import noHardcodedFontSize from './no-hardcoded-font-size.js';
import noUnknownSpacingToken from './no-unknown-spacing-token.js';
import rechartsExplicitAnimation from './recharts-explicit-animation.js';

export default {
  rules: {
    'no-hardcoded-font-size': noHardcodedFontSize,
    'no-unknown-spacing-token': noUnknownSpacingToken,
    'recharts-explicit-animation': rechartsExplicitAnimation,
  },
};
