const SEARCH_TYPES = ['artists', 'albums', 'tracks'];

const search = ({ query, type, limit } = { limit: 20, type: 'tracks' }) => {
  if (!query) {
    throw new Error('Search must specify a query');
  }

  let searchTypes = Array.isArray(type) ? type.join(',') : type;
  let searchQuery = query.replace(/\s/g, '+');
};
