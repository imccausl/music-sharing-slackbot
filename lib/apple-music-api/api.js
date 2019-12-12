const VALID_STOREFRONTS = ['ca', 'us'];
const API = {
  root: 'https://api.music.apple.com/v1',
  search: (country = 'ca') => {
    if (!VALID_STOREFRONTS.includes(country)) {
      throw new Error('Must be a valid ISO 3166 alpha-2 country code');
    }

    return `catalog/${country}/search`;
  },
};
