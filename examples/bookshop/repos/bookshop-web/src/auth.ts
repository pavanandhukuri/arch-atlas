import Keycloak from 'keycloak-js';

/** Sign-in happens against Keycloak; the token is then sent to the API gateway. */
export const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL,
  realm: 'bookshop',
  clientId: 'bookshop-web',
});
