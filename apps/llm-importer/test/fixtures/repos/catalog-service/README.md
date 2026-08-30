# catalog-service

A Go gRPC service that serves the product catalog. Defines and serves
`shop.CatalogService` (`catalog.proto`), registered in `cmd/server/main.go` via
`pb.RegisterCatalogServiceServer`. No HTTP surface, no datastore. Called over gRPC
by `storefront`.
