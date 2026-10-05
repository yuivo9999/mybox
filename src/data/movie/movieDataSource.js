export function createMovieDataSource({ fetchMovies }) {
  if (typeof fetchMovies !== 'function') throw new TypeError('fetchMovies must be a function');
  return Object.freeze({ fetchMovies });
}
