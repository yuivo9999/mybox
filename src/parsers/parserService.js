import { createParserChain } from './parserChain.js';
import { directParser } from './directParser.js';
import { hlsParser } from './hlsParser.js';
import { dashParser } from './dashParser.js';
import { createTVBoxConfiguredParser } from './tvboxConfiguredParser.js';
export const parserService = {
  chain: createParserChain([hlsParser, dashParser, directParser]),
  resolve(candidate, options = {}) {
    const configured = candidate?.metadata?.tvboxParseConfig;
    if (configured?.parses?.length) {
      const configuredParser = createTVBoxConfiguredParser(configured);
      return createParserChain([configuredParser, hlsParser, dashParser, directParser]).resolve(candidate, options);
    }
    return this.chain.resolve(candidate, options);
  },
};
