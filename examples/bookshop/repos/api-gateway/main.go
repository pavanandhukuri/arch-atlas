// Command api-gateway is the single public entry point of the Bookshop: it
// authenticates every request against Keycloak and reverse-proxies /api/books
// to the catalog-service and /api/orders to the order-service.
package main

import (
	"context"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"

	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/lestrrat-go/jwx/v2/jwt"
)

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func proxyTo(target string) http.Handler {
	u, err := url.Parse(target)
	if err != nil {
		log.Fatalf("bad upstream %q: %v", target, err)
	}
	return httputil.NewSingleHostReverseProxy(u)
}

// authenticated rejects requests without a valid Keycloak-issued bearer token.
func authenticated(keys jwk.Set, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if _, err := jwt.Parse([]byte(raw), jwt.WithKeySet(keys)); err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	// Signing keys are fetched from Keycloak's JWKS endpoint.
	jwksURL := getenv("KEYCLOAK_JWKS_URL",
		"http://keycloak:8080/realms/bookshop/protocol/openid-connect/certs")
	keys, err := jwk.Fetch(context.Background(), jwksURL)
	if err != nil {
		log.Fatalf("fetching JWKS from Keycloak: %v", err)
	}

	catalog := proxyTo(getenv("CATALOG_URL", "http://catalog-service:8081"))
	orders := proxyTo(getenv("ORDER_URL", "http://order-service:8082"))

	mux := http.NewServeMux()
	mux.Handle("/api/books/", http.StripPrefix("/api", authenticated(keys, catalog)))
	mux.Handle("/api/orders/", http.StripPrefix("/api", authenticated(keys, orders)))
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	log.Println("api-gateway listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}
