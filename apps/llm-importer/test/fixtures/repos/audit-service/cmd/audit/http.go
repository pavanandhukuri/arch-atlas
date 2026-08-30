package main

import "net/http"

// registers POST /v1/audit (fronted by the API gateway at /api/audit/v1/audit).
func routes(mux *http.ServeMux) {
	mux.HandleFunc("/v1/audit", func(w http.ResponseWriter, r *http.Request) {})
}
