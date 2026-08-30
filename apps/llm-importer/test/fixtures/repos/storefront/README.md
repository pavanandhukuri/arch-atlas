# storefront

A Go web storefront. Holds no gRPC service of its own; it is a gRPC **client** of
`catalog-service` — `internal/catalog/client.go` constructs the stub with
`pb.NewCatalogServiceClient(conn)`. The only documented cross-repo edge is
`storefront → catalog-service` (gRPC `calls`).
