# Proof: gRPC-Aware Cross-Repository Correlation

Model: `Qwen3-Coder-30B-A3B-Instruct-MLX-4bit` @ local oMLX (`http://127.0.0.1:8000/v1`),
`EVAL_TEMPERATURE=0.1`. Deterministic correlation (no `--agentic`).

## Online Boutique (`GoogleCloudPlatform/microservices-demo` @ `72ba613a05f7fcee51cf1d0badff401b6ae7074d`)

10 services, all inter-service communication is gRPC. 14 documented edges.

### Cross-repo connections

| metric                                              | before 009 | after 009 (3 runs)     |
| --------------------------------------------------- | ---------- | ---------------------- |
| `connectionsRecall`                                 | **0.0**    | **1.0** (stddev 0)     |
| `connectionsPrecision` (workspace-wide, all passes) | 0.0        | **0.667**              |
| gRPC-pass edges: true positives                     | —          | **14 / 14, every run** |
| gRPC-pass edges: false positives                    | —          | **0, every run**       |
| gRPC-pass edges: misses                             | —          | **0, every run**       |

The gRPC pass is exactly precise and complete on the reference workspace. Every edge is at full
confidence weight `0.8` (no ambiguity demotion — each client stub resolves to exactly one server).

### The 14 gRPC connections produced (identical across all 3 runs)

```
frontend            → adservice, cartservice, checkoutservice, currencyservice,
                      productcatalogservice, recommendationservice, shippingservice
checkoutservice     → cartservice, currencyservice, emailservice, paymentservice,
                      productcatalogservice, shippingservice
recommendationservice → productcatalogservice
```

Each carries evidence naming the constructing file + line, e.g.
`checkoutservice/main.go:341 constructs a go gRPC client for "ProductCatalogService", matching
productcatalogservice's served gRPC service "hipstershop.ProductCatalogService"`.

### Why workspace-wide precision is 0.667, not higher

7 false-positive edges per run, **all from passes this feature does not touch** (FR-013). They
pre-date 009 — the pre-009 baseline was `precision 0 / recall 0`, i.e. these same 7 predictions,
all wrong; 009 adds 14 correct edges on top.

| #   | pass       | edge(s)                                                    | cause                                                                              |
| --- | ---------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 3   | `schema`   | currencyservice↔paymentservice↔adservice                   | byte-identical vendored `demo.proto` copies → `depends_on` per pair                |
| 3   | `schema`   | cartservice → {adservice, currencyservice, paymentservice} | `cartservice/Cart.proto` shares `package hipstershop` → drift `depends_on`         |
| 1   | `endpoint` | adservice → frontend                                       | a hard-coded product id in adservice demo code matched frontend's `GET /product/*` |

Follow-up (separate spec): `schemaPass` should not treat "both repos vendor the same shared
multi-service contract" as a dependency. See research.md D14.

### Per-repo extraction (unchanged by 009 — analysis step not modified)

`grpcServicesF1 ≈ 0.73`, `languagesF1 ≈ 0.97`, `frameworksF1 ≈ 0.83`, `httpRoutesF1 ≈ 0.87`,
`topicsF1 = 1.0`, `outboundRecall = 1.0`. Consistent with the 008 baseline (± model run-to-run
variance).

## Fixtures set (in-repo synthetic, HTTP + topics, no gRPC)

Regression check — 009 must not disturb the non-gRPC passes.

| metric                 | 008 baseline | after 009 (3 runs) |
| ---------------------- | ------------ | ------------------ |
| `connectionsRecall`    | 0.8          | 0.933              |
| `connectionsPrecision` | 0.667        | 0.822              |
| `grpcServicesF1`       | 1.0          | 1.0                |
| `topicsF1`             | 0.75         | 1.0                |

No regression — connection metrics equal-or-better. The `catalog-service`/`storefront` gRPC pair
is **not** in this eval set (only the 4 HTTP/topic repos), so no gRPC connection is produced here;
the movement is model run-to-run variance on the analysis step, not a 009 effect. Non-connection
analysis F1s (`frameworksF1` etc.) wobble ±0.1 run-to-run — 009 does not touch the analysis step.

## Unit / integration

`grpc-parser.test.ts` (37), `grpc-pass.test.ts` (12), `grpc-correlation.integration.test.ts` (2),
plus additions to `evidence-collect`, `evidence-passes`, `review-assembly`. New files
(`parsers/grpc.ts`, `grpcPass`) ≥ 90% branch / 100% statement coverage. Full package suite:
265 passing / 2 skipped.
